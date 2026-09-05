import { SCORE_DIMENSIONS, type DecisionOption, type DimensionScores, type DimensionWeights, type OptimizationPriority } from '@/types';

/**
 * Weighting model.
 *
 * The customer's stated priority selects the weights, so preferences change the
 * ranking rather than merely decorating it. Weights are data, not prompt text —
 * the model never gets to choose how much cost matters.
 */
export const WEIGHTS_BY_PRIORITY: Readonly<Record<OptimizationPriority, DimensionWeights>> = {
  fastest: {
    arrivalTime: 0.4,
    cost: 0.1,
    comfort: 0.15,
    loyaltyImpact: 0.1,
    sustainability: 0.05,
    rebookingRisk: 0.2,
  },
  cheapest: {
    arrivalTime: 0.2,
    cost: 0.4,
    comfort: 0.1,
    loyaltyImpact: 0.1,
    sustainability: 0.05,
    rebookingRisk: 0.15,
  },
  most_comfortable: {
    arrivalTime: 0.2,
    cost: 0.1,
    comfort: 0.35,
    loyaltyImpact: 0.15,
    sustainability: 0.05,
    rebookingRisk: 0.15,
  },
  most_sustainable: {
    arrivalTime: 0.2,
    cost: 0.15,
    comfort: 0.1,
    loyaltyImpact: 0.05,
    sustainability: 0.35,
    rebookingRisk: 0.15,
  },
};

/** Every score is clamped to 0–100 so a malformed AI value cannot skew the rank. */
export function clampScores(scores: Partial<DimensionScores>): DimensionScores {
  const clamped = {} as Record<string, number>;
  for (const dimension of SCORE_DIMENSIONS) {
    const raw = scores[dimension];
    clamped[dimension] = Math.min(100, Math.max(0, Math.round(typeof raw === 'number' ? raw : 50)));
  }
  return clamped as DimensionScores;
}

export function weightedScore(scores: DimensionScores, weights: DimensionWeights): number {
  const total = SCORE_DIMENSIONS.reduce((sum, dimension) => sum + weights[dimension], 0);
  if (total === 0) return 0;

  const weighted = SCORE_DIMENSIONS.reduce(
    (sum, dimension) => sum + scores[dimension] * weights[dimension],
    0,
  );

  // Two decimals: enough to break ties, few enough to stay exactly reproducible.
  return Math.round((weighted / total) * 100) / 100;
}

export type ScoredCandidate = Omit<DecisionOption, 'rank' | 'weightedScore'> & {
  readonly scores: DimensionScores;
};

/**
 * Deterministic ranking.
 *
 * The AI supplies per-dimension scores; this function decides the order. Given
 * identical scores the result is byte-identical every time — the ranking is
 * never re-prompted. Ties break on cost, then on option id, so the ordering is
 * total rather than dependent on input sequence.
 */
export function rankOptions(
  candidates: readonly ScoredCandidate[],
  weights: DimensionWeights,
): DecisionOption[] {
  return candidates
    .map((candidate) => ({
      ...candidate,
      scores: clampScores(candidate.scores),
      weightedScore: weightedScore(clampScores(candidate.scores), weights),
      rank: 0,
    }))
    .sort(
      (a, b) =>
        b.weightedScore - a.weightedScore ||
        a.estimatedCost - b.estimatedCost ||
        a.optionId.localeCompare(b.optionId),
    )
    .map((option, index) => ({ ...option, rank: index + 1 }));
}
