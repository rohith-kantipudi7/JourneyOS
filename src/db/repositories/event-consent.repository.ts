import { and, desc, eq } from 'drizzle-orm';

import type { Clock, CorrelationId, CustomerId, EventId, JourneyId } from '@/core/shared';
import { systemClock } from '@/core/shared';
import type {
  Consent,
  ConsentChannel,
  ConsentPurpose,
  ConsentRepository,
  EventRepository,
  JourneyEvent,
  NewConsent,
  NewJourneyEvent,
} from '@/types';

import type { Database } from '../client';
import { consents, events } from '../schema';
import { RecordNotFoundError } from './errors';
import { toConsent, toJourneyEvent } from './mappers';

export class SqliteEventRepository implements EventRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock = systemClock,
  ) {}

  async findById(id: EventId): Promise<JourneyEvent | undefined> {
    const [row] = await this.db.select().from(events).where(eq(events.id, id)).limit(1);
    return row ? toJourneyEvent(row) : undefined;
  }

  async findByCorrelationId(correlationId: CorrelationId): Promise<JourneyEvent | undefined> {
    const [row] = await this.db
      .select()
      .from(events)
      .where(eq(events.correlationId, correlationId))
      .limit(1);
    return row ? toJourneyEvent(row) : undefined;
  }

  async listByJourney(journeyId: JourneyId): Promise<JourneyEvent[]> {
    const rows = await this.db
      .select()
      .from(events)
      .where(eq(events.journeyId, journeyId))
      .orderBy(events.occurredAt);
    return rows.map(toJourneyEvent);
  }

  async listByCustomer(customerId: CustomerId, limit = 50): Promise<JourneyEvent[]> {
    const rows = await this.db
      .select()
      .from(events)
      .where(eq(events.customerId, customerId))
      .orderBy(desc(events.occurredAt))
      .limit(limit);
    return rows.map(toJourneyEvent);
  }

  async create(event: NewJourneyEvent): Promise<JourneyEvent> {
    const [row] = await this.db
      .insert(events)
      .values({ ...event, receivedAt: this.clock.now() })
      .returning();

    if (!row) throw new Error('Failed to insert event');
    return toJourneyEvent(row);
  }

  async attachToJourney(id: EventId, journeyId: JourneyId): Promise<JourneyEvent> {
    const [row] = await this.db.update(events).set({ journeyId }).where(eq(events.id, id)).returning();

    if (!row) throw new RecordNotFoundError('Event', id);
    return toJourneyEvent(row);
  }
}

export class SqliteConsentRepository implements ConsentRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock = systemClock,
  ) {}

  async listByCustomer(customerId: CustomerId): Promise<Consent[]> {
    const rows = await this.db.select().from(consents).where(eq(consents.customerId, customerId));
    return rows.map(toConsent);
  }

  async find(
    customerId: CustomerId,
    channel: ConsentChannel,
    purpose: ConsentPurpose,
  ): Promise<Consent | undefined> {
    const [row] = await this.db
      .select()
      .from(consents)
      .where(
        and(eq(consents.customerId, customerId), eq(consents.channel, channel), eq(consents.purpose, purpose)),
      )
      .limit(1);
    return row ? toConsent(row) : undefined;
  }

  /** A revoked grant is never "granted", regardless of the stored boolean. */
  async isGranted(
    customerId: CustomerId,
    channel: ConsentChannel,
    purpose: ConsentPurpose,
  ): Promise<boolean> {
    const consent = await this.find(customerId, channel, purpose);
    return Boolean(consent?.granted) && consent?.revokedAt === null;
  }

  async upsert(consent: NewConsent): Promise<Consent> {
    const [row] = await this.db
      .insert(consents)
      .values({ ...consent, id: consent.id, revokedAt: consent.revokedAt ?? null })
      .onConflictDoUpdate({
        target: [consents.customerId, consents.channel, consents.purpose],
        set: {
          granted: consent.granted,
          source: consent.source,
          capturedAt: consent.capturedAt,
          revokedAt: consent.revokedAt ?? null,
        },
      })
      .returning();

    if (!row) throw new Error('Failed to upsert consent');
    return toConsent(row);
  }

  async revoke(customerId: CustomerId, channel: ConsentChannel, purpose: ConsentPurpose): Promise<Consent> {
    const [row] = await this.db
      .update(consents)
      .set({ granted: false, revokedAt: this.clock.now() })
      .where(
        and(eq(consents.customerId, customerId), eq(consents.channel, channel), eq(consents.purpose, purpose)),
      )
      .returning();

    if (!row) throw new RecordNotFoundError('Consent', `${customerId}/${channel}/${purpose}`);
    return toConsent(row);
  }
}
