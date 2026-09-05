import {
  AuditRecordIds,
  EventIds,
  JourneyIds,
  err,
  ok,
  systemClock,
  toJsonObject,
  type Clock,
  type Result,
} from '@/core/shared';
import type { Logger } from '@/lib/logger';
import { logger as defaultLogger } from '@/lib/logger';
import type { Customer, EventSeverity, Journey, JourneyEvent, Repositories } from '@/types';

import { inboundEventSchema, toFieldErrors, type InboundEvent } from '../schemas';
import { OPEN_JOURNEY_STATUSES, buildJourneyDraft, templateForEventType } from './journey-resolution';
import { deriveSeverity, isDisruptive } from './severity';

export const INGEST_ERROR_CODES = [
  'validation_failed',
  'customer_not_found',
  'journey_not_found',
  'journey_ownership_mismatch',
  'journey_required',
] as const;
export type IngestErrorCode = (typeof INGEST_ERROR_CODES)[number];

export interface IngestFailure {
  readonly code: IngestErrorCode;
  readonly message: string;
  readonly fieldErrors?: Record<string, string[]>;
}

export interface IngestOutcome {
  readonly event: JourneyEvent;
  readonly journey: Journey;
  readonly severity: EventSeverity;
  /** True when this correlation id had already been ingested. */
  readonly duplicate: boolean;
  readonly journeyCreated: boolean;
  readonly journeyStatusChanged: boolean;
}

export interface EventGatewayDeps {
  readonly repositories: Repositories;
  readonly clock?: Clock;
  readonly logger?: Logger;
}

/**
 * Event Gateway — stage 1 of the control loop.
 *
 * Validates an inbound event, guarantees idempotent ingestion by correlation
 * id, attaches it to the right journey (creating one when appropriate), and
 * writes the opening entry of the audit trail.
 */
export class EventGateway {
  private readonly repositories: Repositories;
  private readonly clock: Clock;
  private readonly log: Logger;

  constructor(deps: EventGatewayDeps) {
    this.repositories = deps.repositories;
    this.clock = deps.clock ?? systemClock;
    this.log = (deps.logger ?? defaultLogger).child({ component: 'event-gateway' });
  }

  async ingest(input: unknown): Promise<Result<IngestOutcome, IngestFailure>> {
    const parsed = inboundEventSchema.safeParse(input);

    if (!parsed.success) {
      return err({
        code: 'validation_failed',
        message: 'The event payload failed schema validation.',
        fieldErrors: toFieldErrors(parsed.error),
      });
    }

    const event = parsed.data;

    const existing = await this.repositories.events.findByCorrelationId(event.correlationId);
    if (existing) return this.handleDuplicate(existing);

    const customer = await this.repositories.customers.findById(event.customerId);
    if (!customer) {
      return err({
        code: 'customer_not_found',
        message: `No customer exists with id ${event.customerId}.`,
      });
    }

    const resolution = await this.resolveJourney(event, customer);
    if (!resolution.ok) return resolution;

    const { journey, created } = resolution.value;
    const severity = deriveSeverity(event);

    const stored = await this.repositories.events.create({
      id: EventIds.generate(),
      type: event.type,
      customerId: customer.id,
      journeyId: journey.id,
      correlationId: event.correlationId,
      severity,
      source: event.source,
      payload: toJsonObject(event.payload),
      occurredAt: event.occurredAt,
    });

    // A newly created journey already reflects the disruption.
    const shouldDisrupt = isDisruptive(severity) && !created && journey.status === 'active';
    const finalJourney = shouldDisrupt
      ? await this.repositories.journeys.updateStatus(journey.id, 'disrupted')
      : journey;

    await this.repositories.audit.append({
      id: AuditRecordIds.generate(),
      journeyId: finalJourney.id,
      correlationId: event.correlationId,
      stage: 'event',
      actor: 'system',
      action: `event.${event.type}`,
      outcome: 'success',
      summary: `Ingested ${event.type} (${severity}) from ${event.source}.`,
      payload: toJsonObject({
        eventId: stored.id,
        severity,
        journeyCreated: created,
        journeyStatusChanged: shouldDisrupt,
      }),
      occurredAt: this.clock.now(),
    });

    this.log.info('event ingested', {
      eventId: stored.id,
      journeyId: finalJourney.id,
      correlationId: event.correlationId,
      type: event.type,
      eventSeverity: severity,
    });

    return ok({
      event: stored,
      journey: finalJourney,
      severity,
      duplicate: false,
      journeyCreated: created,
      journeyStatusChanged: shouldDisrupt,
    });
  }

  /**
   * Replaying a correlation id is a no-op against journey state. The
   * suppression is still recorded, so the audit trail proves the duplicate was
   * received and deliberately ignored.
   */
  private async handleDuplicate(existing: JourneyEvent): Promise<Result<IngestOutcome, IngestFailure>> {
    const journey = existing.journeyId
      ? await this.repositories.journeys.findById(existing.journeyId)
      : undefined;

    if (!journey) {
      return err({
        code: 'journey_not_found',
        message: `Duplicate event ${existing.id} is not attached to a journey.`,
      });
    }

    await this.repositories.audit.append({
      id: AuditRecordIds.generate(),
      journeyId: journey.id,
      correlationId: existing.correlationId,
      stage: 'event',
      actor: 'system',
      action: 'event.duplicate_suppressed',
      outcome: 'skipped',
      summary: `Correlation id ${existing.correlationId} was already ingested; no state changed.`,
      payload: toJsonObject({ eventId: existing.id }),
      occurredAt: this.clock.now(),
    });

    this.log.warn('duplicate event suppressed', {
      eventId: existing.id,
      correlationId: existing.correlationId,
    });

    return ok({
      event: existing,
      journey,
      severity: existing.severity,
      duplicate: true,
      journeyCreated: false,
      journeyStatusChanged: false,
    });
  }

  private async resolveJourney(
    event: InboundEvent,
    customer: Customer,
  ): Promise<Result<{ journey: Journey; created: boolean }, IngestFailure>> {
    if (event.journeyId) {
      const journey = await this.repositories.journeys.findById(event.journeyId);

      if (!journey) {
        return err({ code: 'journey_not_found', message: `No journey exists with id ${event.journeyId}.` });
      }
      if (journey.customerId !== customer.id) {
        return err({
          code: 'journey_ownership_mismatch',
          message: `Journey ${event.journeyId} does not belong to customer ${customer.id}.`,
        });
      }

      return ok({ journey, created: false });
    }

    const openJourneys = (await this.repositories.journeys.listByCustomer(customer.id)).filter((journey) =>
      OPEN_JOURNEY_STATUSES.includes(journey.status),
    );

    const template = templateForEventType(event.type);

    if (!template) {
      // Complaints attach to the newest open journey; they never create one.
      const [newest] = openJourneys;
      if (!newest) {
        return err({
          code: 'journey_required',
          message: `A ${event.type} event needs an open journey to attach to, and ${customer.id} has none.`,
        });
      }
      return ok({ journey: newest, created: false });
    }

    const match = openJourneys.find((journey) => journey.template === template);
    if (match) return ok({ journey: match, created: false });

    const draft = buildJourneyDraft(event);
    if (!draft) {
      return err({
        code: 'journey_required',
        message: `Cannot derive a journey for event type ${event.type}.`,
      });
    }

    const severity = deriveSeverity(event);
    const journey = await this.repositories.journeys.create({
      id: JourneyIds.generate(),
      customerId: customer.id,
      template: draft.template,
      status: isDisruptive(severity) ? 'disrupted' : 'active',
      goal: draft.goal,
      context: draft.context,
      startedAt: event.occurredAt,
      completedAt: null,
    });

    return ok({ journey, created: true });
  }
}
