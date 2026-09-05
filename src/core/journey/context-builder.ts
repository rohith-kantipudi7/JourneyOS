import {
  AuditRecordIds,
  SnapshotIds,
  err,
  ok,
  systemClock,
  toJsonObject,
  type Clock,
  type EventId,
  type JourneyId,
  type Result,
} from '@/core/shared';
import type { Logger } from '@/lib/logger';
import { logger as defaultLogger } from '@/lib/logger';
import type { ContextEdge, ContextNode, ContextSnapshot, Repositories } from '@/types';

import {
  consentNode,
  customerNode,
  edge,
  eventNode,
  journeyNode,
  preferenceNode,
  priorIncidentNode,
  priorIncidentNodeId,
} from './nodes';
import { contextRiskContribution, summarizePriorIncidents } from './prior-incidents';
import { contextSnapshotSchema } from './snapshot.schema';

export const CONTEXT_BUILD_ERROR_CODES = [
  'journey_not_found',
  'event_not_found',
  'customer_not_found',
  'event_journey_mismatch',
  'snapshot_invalid',
] as const;
export type ContextBuildErrorCode = (typeof CONTEXT_BUILD_ERROR_CODES)[number];

export interface ContextBuildFailure {
  readonly code: ContextBuildErrorCode;
  readonly message: string;
  readonly fieldErrors?: Record<string, string[]>;
}

export interface BuildContextInput {
  readonly journeyId: JourneyId;
  readonly eventId: EventId;
}

export interface ContextBuilderDeps {
  readonly repositories: Repositories;
  readonly clock?: Clock;
  readonly logger?: Logger;
  /** How many prior journeys to traverse. */
  readonly historyLimit?: number;
  /** How many earlier events on the current journey to include. */
  readonly journeyEventLimit?: number;
}

/**
 * Journey Context Builder — stage 2 of the control loop.
 *
 * Produces an immutable, provenance-tagged graph of everything a decision is
 * allowed to depend on. Multi-hop by design: prior journeys and their events
 * are traversed and folded into a `PriorIncidentSummary`, so history influences
 * the outcome rather than only the current event.
 */
export class JourneyContextBuilder {
  private readonly repositories: Repositories;
  private readonly clock: Clock;
  private readonly log: Logger;
  private readonly historyLimit: number;
  private readonly journeyEventLimit: number;

  constructor(deps: ContextBuilderDeps) {
    this.repositories = deps.repositories;
    this.clock = deps.clock ?? systemClock;
    this.log = (deps.logger ?? defaultLogger).child({ component: 'context-builder' });
    this.historyLimit = deps.historyLimit ?? 10;
    this.journeyEventLimit = deps.journeyEventLimit ?? 5;
  }

  /** Pure computation — no writes. */
  async build(input: BuildContextInput): Promise<Result<ContextSnapshot, ContextBuildFailure>> {
    const now = this.clock.now();

    const journey = await this.repositories.journeys.findById(input.journeyId);
    if (!journey) {
      return err({ code: 'journey_not_found', message: `No journey exists with id ${input.journeyId}.` });
    }

    const triggerEvent = await this.repositories.events.findById(input.eventId);
    if (!triggerEvent) {
      return err({ code: 'event_not_found', message: `No event exists with id ${input.eventId}.` });
    }

    if (triggerEvent.journeyId !== journey.id) {
      return err({
        code: 'event_journey_mismatch',
        message: `Event ${input.eventId} is not attached to journey ${input.journeyId}.`,
      });
    }

    const customer = await this.repositories.customers.findById(journey.customerId);
    if (!customer) {
      return err({ code: 'customer_not_found', message: `No customer exists with id ${journey.customerId}.` });
    }

    const [consents, history, customerEvents, journeyEvents] = await Promise.all([
      this.repositories.consents.listByCustomer(customer.id),
      this.repositories.journeys.listHistory(customer.id, journey.id, this.historyLimit),
      this.repositories.events.listByCustomer(customer.id, 100),
      this.repositories.events.listByJourney(journey.id),
    ]);

    const historyIds = new Set(history.map((prior) => prior.id));
    const historicalEvents = customerEvents.filter(
      (event) => event.journeyId !== null && historyIds.has(event.journeyId),
    );

    const summary = summarizePriorIncidents(history, historicalEvents, now);
    const riskContribution = contextRiskContribution(summary);

    const nodes: ContextNode[] = [
      customerNode(customer, now),
      preferenceNode(customer, now),
      journeyNode(journey, now),
      eventNode(triggerEvent, now),
      ...consents.map((consent) => consentNode(consent, now)),
      priorIncidentNode(customer.id, summary, riskContribution, now),
    ];

    const edges: ContextEdge[] = [
      edge('TRIGGERS', triggerEvent.id, journey.id, 'triggered'),
      edge('BELONGS_TO', journey.id, customer.id, 'belongs to'),
      edge('CONSTRAINS', preferenceNode(customer, now).id, journey.id, 'constrains'),
      ...consents.map((consent) => edge('CONSTRAINS', consent.id, journey.id, 'governs')),
      edge('AFFECTS', priorIncidentNodeId(customer.id), journey.id, 'raises risk for'),
    ];

    // Earlier events on this journey give the decision short-term context.
    for (const event of journeyEvents.filter((candidate) => candidate.id !== triggerEvent.id).slice(
      -this.journeyEventLimit,
    )) {
      nodes.push(eventNode(event, now, 'archive'));
      edges.push(edge('AFFECTS', event.id, journey.id, 'preceded'));
    }

    // Multi-hop: prior journeys and their events hang off the summary node.
    for (const prior of history) {
      nodes.push(journeyNode(prior, now, `Prior: ${prior.goal}`, 'archive'));
      edges.push(edge('DERIVED_FROM', priorIncidentNodeId(customer.id), prior.id, 'derived from'));
      edges.push(edge('BELONGS_TO', prior.id, customer.id, 'belongs to'));

      for (const priorEvent of historicalEvents.filter((event) => event.journeyId === prior.id)) {
        nodes.push(eventNode(priorEvent, now, 'archive'));
        edges.push(edge('TRIGGERS', priorEvent.id, prior.id, 'triggered'));
      }
    }

    const snapshot: ContextSnapshot = {
      id: SnapshotIds.generate(),
      journeyId: journey.id,
      customerId: customer.id,
      eventId: triggerEvent.id,
      nodes,
      edges,
      stale: nodes.some((node) => node.provenance.stale),
      builtAt: now,
    };

    const validation = contextSnapshotSchema.safeParse(snapshot);
    if (!validation.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of validation.error.issues) {
        (fieldErrors[issue.path.join('.') || '_root'] ??= []).push(issue.message);
      }
      this.log.error('snapshot failed validation', { journeyId: journey.id, fieldErrors });
      return err({
        code: 'snapshot_invalid',
        message: 'The assembled context snapshot failed schema validation.',
        fieldErrors,
      });
    }

    return ok(snapshot);
  }

  /** Builds, persists immutably, and records the context stage in the audit ledger. */
  async capture(input: BuildContextInput): Promise<Result<ContextSnapshot, ContextBuildFailure>> {
    const built = await this.build(input);
    if (!built.ok) return built;

    const snapshot = built.value;
    const triggerEvent = await this.repositories.events.findById(snapshot.eventId);
    if (!triggerEvent) {
      return err({ code: 'event_not_found', message: `No event exists with id ${snapshot.eventId}.` });
    }

    const persisted = await this.repositories.snapshots.create(snapshot);

    await this.repositories.audit.append({
      id: AuditRecordIds.generate(),
      journeyId: snapshot.journeyId,
      correlationId: triggerEvent.correlationId,
      stage: 'context',
      actor: 'system',
      action: 'context.snapshot_built',
      outcome: 'success',
      summary: `Built context snapshot with ${snapshot.nodes.length} nodes and ${snapshot.edges.length} edges.`,
      payload: toJsonObject({
        snapshotId: persisted.id,
        nodeCount: snapshot.nodes.length,
        edgeCount: snapshot.edges.length,
        stale: snapshot.stale,
      }),
      occurredAt: this.clock.now(),
    });

    this.log.info('context snapshot captured', {
      snapshotId: persisted.id,
      journeyId: snapshot.journeyId,
      nodeCount: snapshot.nodes.length,
      edgeCount: snapshot.edges.length,
      stale: snapshot.stale,
    });

    return ok(persisted);
  }
}
