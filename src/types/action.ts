import type { ActionId, DecisionId, IdempotencyKey, JourneyId, JsonObject } from '@/core/shared';

export const ACTION_TYPES = [
  'rebookFlight',
  'issueVoucher',
  'reserveHotel',
  'bookTransport',
  'createSupportCase',
  'sendNotification',
  'escalateHuman',
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const ACTION_STATUSES = [
  'pending_approval',
  'approved',
  'executing',
  'succeeded',
  'failed',
  'denied',
  'cancelled',
] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

export const ACTION_ACTORS = ['customer', 'human_agent', 'system'] as const;
export type ActionActor = (typeof ACTION_ACTORS)[number];

export interface Action {
  readonly id: ActionId;
  readonly decisionId: DecisionId;
  readonly journeyId: JourneyId;
  readonly type: ActionType;
  readonly status: ActionStatus;
  /** Unique per logical action; re-submitting the same key must not re-execute. */
  readonly idempotencyKey: IdempotencyKey;
  readonly request: JsonObject;
  readonly result: JsonObject | null;
  readonly failureReason: string | null;
  readonly approvedBy: ActionActor | null;
  readonly approvedAt: Date | null;
  readonly executedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type NewAction = Omit<
  Action,
  'result' | 'failureReason' | 'approvedBy' | 'approvedAt' | 'executedAt' | 'createdAt' | 'updatedAt'
>;
