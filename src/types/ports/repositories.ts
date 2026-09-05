import type {
  ActionId,
  CorrelationId,
  CustomerId,
  DecisionId,
  EventId,
  IdempotencyKey,
  JourneyId,
  SnapshotId,
} from '@/core/shared';

import type { Action, ActionStatus, NewAction } from '../action';
import type { AuditRecord, AuditStage, NewAuditRecord } from '../audit';
import type { Consent, ConsentChannel, ConsentPurpose, NewConsent } from '../consent';
import type { Decision, DecisionStatus, NewDecision } from '../decision';
import type { JourneyEvent, NewJourneyEvent } from '../event';
import type { Customer, NewCustomer } from '../customer';
import type { Journey, JourneyStatus, NewJourney } from '../journey';
import type { ContextSnapshot, NewContextSnapshot } from '../snapshot';

/**
 * Repository ports.
 *
 * Services and core logic depend on these interfaces, never on Drizzle. The
 * SQLite implementations live in `src/db/repositories`; tests inject in-memory
 * fakes or a `:memory:` database.
 */

export interface CustomerRepository {
  findById(id: CustomerId): Promise<Customer | undefined>;
  findByEmail(email: string): Promise<Customer | undefined>;
  list(): Promise<Customer[]>;
  create(customer: NewCustomer): Promise<Customer>;
  updatePreferences(id: CustomerId, preferences: Customer['preferences']): Promise<Customer>;
}

export interface JourneyRepository {
  findById(id: JourneyId): Promise<Journey | undefined>;
  listByCustomer(customerId: CustomerId): Promise<Journey[]>;
  /** Journeys other than `excludeJourneyId`, newest first — powers multi-hop history. */
  listHistory(customerId: CustomerId, excludeJourneyId: JourneyId, limit?: number): Promise<Journey[]>;
  create(journey: NewJourney): Promise<Journey>;
  updateStatus(id: JourneyId, status: JourneyStatus): Promise<Journey>;
  updateContext(id: JourneyId, context: Journey['context']): Promise<Journey>;
}

export interface EventRepository {
  findById(id: EventId): Promise<JourneyEvent | undefined>;
  /** Idempotency lookup — a repeat correlation id must not create a second event. */
  findByCorrelationId(correlationId: CorrelationId): Promise<JourneyEvent | undefined>;
  listByJourney(journeyId: JourneyId): Promise<JourneyEvent[]>;
  listByCustomer(customerId: CustomerId, limit?: number): Promise<JourneyEvent[]>;
  create(event: NewJourneyEvent): Promise<JourneyEvent>;
  attachToJourney(id: EventId, journeyId: JourneyId): Promise<JourneyEvent>;
}

export interface ConsentRepository {
  listByCustomer(customerId: CustomerId): Promise<Consent[]>;
  find(customerId: CustomerId, channel: ConsentChannel, purpose: ConsentPurpose): Promise<Consent | undefined>;
  isGranted(customerId: CustomerId, channel: ConsentChannel, purpose: ConsentPurpose): Promise<boolean>;
  upsert(consent: NewConsent): Promise<Consent>;
  revoke(customerId: CustomerId, channel: ConsentChannel, purpose: ConsentPurpose): Promise<Consent>;
}

export interface SnapshotRepository {
  findById(id: SnapshotId): Promise<ContextSnapshot | undefined>;
  listByJourney(journeyId: JourneyId): Promise<ContextSnapshot[]>;
  create(snapshot: NewContextSnapshot): Promise<ContextSnapshot>;
}

export interface DecisionRepository {
  findById(id: DecisionId): Promise<Decision | undefined>;
  listByJourney(journeyId: JourneyId): Promise<Decision[]>;
  findLatestForEvent(eventId: EventId): Promise<Decision | undefined>;
  create(decision: NewDecision): Promise<Decision>;
  updateStatus(id: DecisionId, status: DecisionStatus, decidedAt: Date): Promise<Decision>;
}

export interface ActionRepository {
  findById(id: ActionId): Promise<Action | undefined>;
  /** Idempotency lookup — a repeat key must return the original action, not re-execute. */
  findByIdempotencyKey(key: IdempotencyKey): Promise<Action | undefined>;
  listByJourney(journeyId: JourneyId): Promise<Action[]>;
  listByDecision(decisionId: DecisionId): Promise<Action[]>;
  create(action: NewAction): Promise<Action>;
  markApproved(id: ActionId, approvedBy: Action['approvedBy'], approvedAt: Date): Promise<Action>;
  markStatus(id: ActionId, status: ActionStatus): Promise<Action>;
  markExecuted(id: ActionId, result: Action['result'], executedAt: Date): Promise<Action>;
  markFailed(id: ActionId, failureReason: string): Promise<Action>;
}

export interface AuditRepository {
  /** Append-only: there is deliberately no update or delete. */
  append(record: NewAuditRecord): Promise<AuditRecord>;
  listByJourney(journeyId: JourneyId): Promise<AuditRecord[]>;
  listByCorrelationId(correlationId: CorrelationId): Promise<AuditRecord[]>;
  listByStage(journeyId: JourneyId, stage: AuditStage): Promise<AuditRecord[]>;
}

/** The full persistence surface, injected as a single dependency. */
export interface Repositories {
  readonly customers: CustomerRepository;
  readonly journeys: JourneyRepository;
  readonly events: EventRepository;
  readonly consents: ConsentRepository;
  readonly snapshots: SnapshotRepository;
  readonly decisions: DecisionRepository;
  readonly actions: ActionRepository;
  readonly audit: AuditRepository;
}
