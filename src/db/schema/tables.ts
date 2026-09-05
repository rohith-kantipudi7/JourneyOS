import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import type {
  ActionId,
  AuditRecordId,
  ConsentId,
  CorrelationId,
  CustomerId,
  DecisionId,
  EventId,
  IdempotencyKey,
  JourneyId,
  JsonObject,
  SnapshotId,
} from '@/core/shared';
import {
  ACTION_ACTORS,
  ACTION_STATUSES,
  ACTION_TYPES,
  AUDIT_ACTORS,
  AUDIT_OUTCOMES,
  AUDIT_STAGES,
  CONSENT_CHANNELS,
  CONSENT_PURPOSES,
  DECISION_STATUSES,
  EVENT_SEVERITIES,
  EVENT_TYPES,
  JOURNEY_STATUSES,
  JOURNEY_TEMPLATES,
  LOYALTY_TIERS,
  PLANNER_KINDS,
  TRUST_OUTCOMES,
} from '@/types';
import type {
  ContextEdge,
  ContextNode,
  CustomerPreferences,
  DecisionOption,
  DimensionWeights,
  RiskFactor,
  TrustCheck,
} from '@/types';

/** Millisecond-precision timestamps stored as integers — SQLite has no native date type. */
const timestamp = (column: string) => integer(column, { mode: 'timestamp_ms' });

export const customers = sqliteTable(
  'customers',
  {
    id: text('id').primaryKey().$type<CustomerId>(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    loyaltyTier: text('loyalty_tier', { enum: LOYALTY_TIERS }).notNull().default('standard'),
    loyaltyPoints: integer('loyalty_points').notNull().default(0),
    preferences: text('preferences', { mode: 'json' }).$type<CustomerPreferences>().notNull(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [uniqueIndex('customers_email_unique').on(table.email)],
);

export const journeys = sqliteTable(
  'journeys',
  {
    id: text('id').primaryKey().$type<JourneyId>(),
    customerId: text('customer_id')
      .notNull()
      .$type<CustomerId>()
      .references(() => customers.id, { onDelete: 'cascade' }),
    template: text('template', { enum: JOURNEY_TEMPLATES }).notNull(),
    status: text('status', { enum: JOURNEY_STATUSES }).notNull().default('active'),
    goal: text('goal').notNull(),
    context: text('context', { mode: 'json' }).$type<JsonObject>().notNull(),
    startedAt: timestamp('started_at').notNull(),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    index('journeys_customer_id_idx').on(table.customerId),
    index('journeys_status_idx').on(table.status),
  ],
);

export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey().$type<EventId>(),
    type: text('type', { enum: EVENT_TYPES }).notNull(),
    customerId: text('customer_id')
      .notNull()
      .$type<CustomerId>()
      .references(() => customers.id, { onDelete: 'cascade' }),
    journeyId: text('journey_id')
      .$type<JourneyId>()
      .references(() => journeys.id, { onDelete: 'set null' }),
    correlationId: text('correlation_id').notNull().$type<CorrelationId>(),
    severity: text('severity', { enum: EVENT_SEVERITIES }).notNull().default('medium'),
    source: text('source').notNull(),
    payload: text('payload', { mode: 'json' }).$type<JsonObject>().notNull(),
    occurredAt: timestamp('occurred_at').notNull(),
    receivedAt: timestamp('received_at').notNull(),
  },
  (table) => [
    // Enforces idempotent ingestion at the database level, not just in code.
    uniqueIndex('events_correlation_id_unique').on(table.correlationId),
    index('events_journey_id_idx').on(table.journeyId),
    index('events_customer_id_idx').on(table.customerId),
  ],
);

export const consents = sqliteTable(
  'consents',
  {
    id: text('id').primaryKey().$type<ConsentId>(),
    customerId: text('customer_id')
      .notNull()
      .$type<CustomerId>()
      .references(() => customers.id, { onDelete: 'cascade' }),
    channel: text('channel', { enum: CONSENT_CHANNELS }).notNull(),
    purpose: text('purpose', { enum: CONSENT_PURPOSES }).notNull(),
    granted: integer('granted', { mode: 'boolean' }).notNull(),
    source: text('source').notNull(),
    capturedAt: timestamp('captured_at').notNull(),
    revokedAt: timestamp('revoked_at'),
  },
  (table) => [
    uniqueIndex('consents_customer_channel_purpose_unique').on(table.customerId, table.channel, table.purpose),
  ],
);

export const contextSnapshots = sqliteTable(
  'context_snapshots',
  {
    id: text('id').primaryKey().$type<SnapshotId>(),
    journeyId: text('journey_id')
      .notNull()
      .$type<JourneyId>()
      .references(() => journeys.id, { onDelete: 'cascade' }),
    customerId: text('customer_id')
      .notNull()
      .$type<CustomerId>()
      .references(() => customers.id, { onDelete: 'cascade' }),
    eventId: text('event_id')
      .notNull()
      .$type<EventId>()
      .references(() => events.id, { onDelete: 'cascade' }),
    nodes: text('nodes', { mode: 'json' }).$type<ContextNode[]>().notNull(),
    edges: text('edges', { mode: 'json' }).$type<ContextEdge[]>().notNull(),
    stale: integer('stale', { mode: 'boolean' }).notNull().default(false),
    builtAt: timestamp('built_at').notNull(),
  },
  (table) => [index('context_snapshots_journey_id_idx').on(table.journeyId)],
);

export const decisions = sqliteTable(
  'decisions',
  {
    id: text('id').primaryKey().$type<DecisionId>(),
    journeyId: text('journey_id')
      .notNull()
      .$type<JourneyId>()
      .references(() => journeys.id, { onDelete: 'cascade' }),
    eventId: text('event_id')
      .notNull()
      .$type<EventId>()
      .references(() => events.id, { onDelete: 'cascade' }),
    // Pins the exact context this reasoning came from, so it can be replayed.
    snapshotId: text('snapshot_id')
      .notNull()
      .$type<SnapshotId>()
      .references(() => contextSnapshots.id, { onDelete: 'restrict' }),
    status: text('status', { enum: DECISION_STATUSES }).notNull().default('proposed'),
    planner: text('planner', { enum: PLANNER_KINDS }).notNull(),
    model: text('model'),
    promptVersion: text('prompt_version').notNull(),
    weights: text('weights', { mode: 'json' }).$type<DimensionWeights>().notNull(),
    bestOption: text('best_option', { mode: 'json' }).$type<DecisionOption>().notNull(),
    alternatives: text('alternatives', { mode: 'json' }).$type<DecisionOption[]>().notNull(),
    confidence: integer('confidence_basis_points').notNull(),
    reasoning: text('reasoning').notNull(),
    evidence: text('evidence', { mode: 'json' }).$type<string[]>().notNull(),
    trustOutcome: text('trust_outcome', { enum: TRUST_OUTCOMES }).notNull(),
    trustRiskScore: integer('trust_risk_score').notNull(),
    trustChecks: text('trust_checks', { mode: 'json' }).$type<TrustCheck[]>().notNull(),
    trustRiskFactors: text('trust_risk_factors', { mode: 'json' }).$type<RiskFactor[]>().notNull(),
    trustPolicyVersion: text('trust_policy_version').notNull(),
    trustEvaluatedAt: timestamp('trust_evaluated_at').notNull(),
    createdAt: timestamp('created_at').notNull(),
    decidedAt: timestamp('decided_at'),
  },
  (table) => [
    index('decisions_journey_id_idx').on(table.journeyId),
    index('decisions_event_id_idx').on(table.eventId),
  ],
);

export const actions = sqliteTable(
  'actions',
  {
    id: text('id').primaryKey().$type<ActionId>(),
    decisionId: text('decision_id')
      .notNull()
      .$type<DecisionId>()
      .references(() => decisions.id, { onDelete: 'cascade' }),
    journeyId: text('journey_id')
      .notNull()
      .$type<JourneyId>()
      .references(() => journeys.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ACTION_TYPES }).notNull(),
    status: text('status', { enum: ACTION_STATUSES }).notNull().default('pending_approval'),
    idempotencyKey: text('idempotency_key').notNull().$type<IdempotencyKey>(),
    request: text('request', { mode: 'json' }).$type<JsonObject>().notNull(),
    result: text('result', { mode: 'json' }).$type<JsonObject>(),
    failureReason: text('failure_reason'),
    approvedBy: text('approved_by', { enum: ACTION_ACTORS }),
    approvedAt: timestamp('approved_at'),
    executedAt: timestamp('executed_at'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    // Double-execution protection enforced by the database.
    uniqueIndex('actions_idempotency_key_unique').on(table.idempotencyKey),
    index('actions_journey_id_idx').on(table.journeyId),
    index('actions_decision_id_idx').on(table.decisionId),
  ],
);

export const auditRecords = sqliteTable(
  'audit_records',
  {
    id: text('id').primaryKey().$type<AuditRecordId>(),
    journeyId: text('journey_id')
      .notNull()
      .$type<JourneyId>()
      .references(() => journeys.id, { onDelete: 'cascade' }),
    correlationId: text('correlation_id').notNull().$type<CorrelationId>(),
    stage: text('stage', { enum: AUDIT_STAGES }).notNull(),
    actor: text('actor', { enum: AUDIT_ACTORS }).notNull(),
    action: text('action').notNull(),
    outcome: text('outcome', { enum: AUDIT_OUTCOMES }).notNull(),
    summary: text('summary').notNull(),
    payload: text('payload', { mode: 'json' }).$type<JsonObject>().notNull(),
    occurredAt: timestamp('occurred_at').notNull(),
  },
  (table) => [
    index('audit_records_journey_id_idx').on(table.journeyId),
    index('audit_records_correlation_id_idx').on(table.correlationId),
  ],
);
