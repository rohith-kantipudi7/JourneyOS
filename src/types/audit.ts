import type { AuditRecordId, CorrelationId, JourneyId, JsonObject } from '@/core/shared';

/** The eight stages of the control loop — every one writes an audit record. */
export const AUDIT_STAGES = [
  'event',
  'context',
  'trust',
  'plan',
  'validate',
  'approval',
  'execute',
  'audit',
] as const;
export type AuditStage = (typeof AUDIT_STAGES)[number];

export const AUDIT_ACTORS = ['system', 'ai', 'trust_kernel', 'customer', 'human_agent', 'adapter'] as const;
export type AuditActor = (typeof AUDIT_ACTORS)[number];

export const AUDIT_OUTCOMES = ['success', 'failure', 'denied', 'skipped'] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

/**
 * Append-only ledger. Records are never updated or deleted — replaying them in
 * order reconstructs exactly how a decision was reached.
 */
export interface AuditRecord {
  readonly id: AuditRecordId;
  readonly journeyId: JourneyId;
  readonly correlationId: CorrelationId;
  readonly stage: AuditStage;
  readonly actor: AuditActor;
  readonly action: string;
  readonly outcome: AuditOutcome;
  readonly summary: string;
  readonly payload: JsonObject;
  readonly occurredAt: Date;
}

export type NewAuditRecord = Omit<AuditRecord, 'occurredAt'> & { readonly occurredAt?: Date };
