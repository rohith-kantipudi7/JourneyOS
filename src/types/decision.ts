import type { DecisionId, EventId, JourneyId, SnapshotId } from '@/core/shared';

import type { ActionType } from './action';
import type { TrustEvaluation } from './trust';

/**
 * The dimensions every recovery option is scored on.
 *
 * The AI proposes a 0–100 score per dimension; deterministic code applies the
 * weights and computes the ranking. That split is what makes the reasoning
 * reproducible rather than "the model said so".
 */
export const SCORE_DIMENSIONS = [
  'arrivalTime',
  'cost',
  'comfort',
  'loyaltyImpact',
  'sustainability',
  'rebookingRisk',
] as const;
export type ScoreDimension = (typeof SCORE_DIMENSIONS)[number];

/** Each value is 0–100, where higher is always better for the customer. */
export type DimensionScores = Readonly<Record<ScoreDimension, number>>;
export type DimensionWeights = Readonly<Record<ScoreDimension, number>>;

export interface DecisionOption {
  readonly optionId: string;
  readonly label: string;
  readonly summary: string;
  readonly actionType: ActionType;
  readonly scores: DimensionScores;
  /** Computed deterministically from `scores` × weights — never AI-supplied. */
  readonly weightedScore: number;
  readonly rank: number;
  readonly estimatedCost: number;
  readonly currency: string;
  /** Concrete facts supporting this option (fare id, seat count, timings). */
  readonly evidence: readonly string[];
  /** Adapter payload required to execute this option if approved. */
  readonly executionParams: Readonly<Record<string, unknown>>;
}

export const DECISION_STATUSES = ['proposed', 'approved', 'declined', 'expired', 'superseded'] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

/** Which planner produced the proposal — the fallback path is first-class. */
export const PLANNER_KINDS = ['ai', 'deterministic_fallback'] as const;
export type PlannerKind = (typeof PLANNER_KINDS)[number];

export interface Decision {
  readonly id: DecisionId;
  readonly journeyId: JourneyId;
  readonly eventId: EventId;
  /** Exact context snapshot this reasoning was derived from — reproducibility. */
  readonly snapshotId: SnapshotId;
  readonly status: DecisionStatus;
  readonly planner: PlannerKind;
  readonly model: string | null;
  readonly promptVersion: string;
  readonly weights: DimensionWeights;
  readonly bestOption: DecisionOption;
  readonly alternatives: readonly DecisionOption[];
  /** 0–1 self-reported by the planner, clamped on validation. */
  readonly confidence: number;
  readonly reasoning: string;
  readonly evidence: readonly string[];
  /** Trust Kernel pre-check result attached to the proposal. */
  readonly trust: TrustEvaluation;
  readonly createdAt: Date;
  readonly decidedAt: Date | null;
}

export type NewDecision = Omit<Decision, 'createdAt' | 'decidedAt'> & {
  readonly decidedAt?: Date | null;
};
