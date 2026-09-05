import type {
  Action,
  AuditRecord,
  Consent,
  ContextSnapshot,
  Customer,
  Decision,
  Journey,
  JourneyEvent,
} from '@/types';

import type { actions, auditRecords, consents, contextSnapshots, customers, decisions, events, journeys } from '../schema';

/**
 * Row → domain mappers.
 *
 * Persistence shapes and domain shapes are deliberately allowed to diverge
 * (for example the Trust evaluation is flattened into columns for querying but
 * nested in the domain model). These functions are the only place that knows
 * about both.
 */

/** Confidence is stored as basis points so SQLite holds an exact integer. */
export const confidenceToBasisPoints = (confidence: number): number =>
  Math.round(Math.min(Math.max(confidence, 0), 1) * 10_000);

export const basisPointsToConfidence = (basisPoints: number): number => basisPoints / 10_000;

export function toCustomer(row: typeof customers.$inferSelect): Customer {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    loyaltyTier: row.loyaltyTier,
    loyaltyPoints: row.loyaltyPoints,
    preferences: row.preferences,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toJourney(row: typeof journeys.$inferSelect): Journey {
  return {
    id: row.id,
    customerId: row.customerId,
    template: row.template,
    status: row.status,
    goal: row.goal,
    context: row.context,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toJourneyEvent(row: typeof events.$inferSelect): JourneyEvent {
  return {
    id: row.id,
    type: row.type,
    customerId: row.customerId,
    journeyId: row.journeyId,
    correlationId: row.correlationId,
    severity: row.severity,
    source: row.source,
    payload: row.payload,
    occurredAt: row.occurredAt,
    receivedAt: row.receivedAt,
  };
}

export function toConsent(row: typeof consents.$inferSelect): Consent {
  return {
    id: row.id,
    customerId: row.customerId,
    channel: row.channel,
    purpose: row.purpose,
    granted: row.granted,
    source: row.source,
    capturedAt: row.capturedAt,
    revokedAt: row.revokedAt,
  };
}

export function toContextSnapshot(row: typeof contextSnapshots.$inferSelect): ContextSnapshot {
  return {
    id: row.id,
    journeyId: row.journeyId,
    customerId: row.customerId,
    eventId: row.eventId,
    nodes: row.nodes,
    edges: row.edges,
    stale: row.stale,
    builtAt: row.builtAt,
  };
}

export function toDecision(row: typeof decisions.$inferSelect): Decision {
  return {
    id: row.id,
    journeyId: row.journeyId,
    eventId: row.eventId,
    snapshotId: row.snapshotId,
    status: row.status,
    planner: row.planner,
    model: row.model,
    promptVersion: row.promptVersion,
    weights: row.weights,
    bestOption: row.bestOption,
    alternatives: row.alternatives,
    confidence: basisPointsToConfidence(row.confidence),
    reasoning: row.reasoning,
    evidence: row.evidence,
    trust: {
      outcome: row.trustOutcome,
      riskScore: row.trustRiskScore,
      riskFactors: row.trustRiskFactors,
      checks: row.trustChecks,
      policyVersion: row.trustPolicyVersion,
      evaluatedAt: row.trustEvaluatedAt,
    },
    createdAt: row.createdAt,
    decidedAt: row.decidedAt,
  };
}

export function toAction(row: typeof actions.$inferSelect): Action {
  return {
    id: row.id,
    decisionId: row.decisionId,
    journeyId: row.journeyId,
    type: row.type,
    status: row.status,
    idempotencyKey: row.idempotencyKey,
    request: row.request,
    result: row.result,
    failureReason: row.failureReason,
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt,
    executedAt: row.executedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toAuditRecord(row: typeof auditRecords.$inferSelect): AuditRecord {
  return {
    id: row.id,
    journeyId: row.journeyId,
    correlationId: row.correlationId,
    stage: row.stage,
    actor: row.actor,
    action: row.action,
    outcome: row.outcome,
    summary: row.summary,
    payload: row.payload,
    occurredAt: row.occurredAt,
  };
}
