import { SCORE_DIMENSIONS, type DecisionOption, type DimensionWeights, type ScoreDimension } from '@/types';

export interface TradeoffRow {
  readonly dimension: ScoreDimension;
  readonly label: string;
  readonly weight: number;
  readonly best: number;
  /** Score per alternative, aligned with the `alternatives` array order. */
  readonly alternatives: readonly number[];
  /** Difference from the best option, per alternative. Positive = alternative wins. */
  readonly deltas: readonly number[];
}

export interface TradeoffTable {
  readonly bestOptionId: string;
  readonly alternativeIds: readonly string[];
  readonly rows: readonly TradeoffRow[];
}

const DIMENSION_LABELS: Readonly<Record<ScoreDimension, string>> = {
  arrivalTime: 'Arrival time',
  cost: 'Cost',
  comfort: 'Comfort',
  loyaltyImpact: 'Loyalty impact',
  sustainability: 'Sustainability',
  rebookingRisk: 'Rebooking certainty',
};

/**
 * Dimension-by-dimension comparison of the recommendation against every
 * alternative, so the Decision Inspector can show what was given up rather
 * than only what was chosen.
 */
export function buildTradeoffTable(
  best: DecisionOption,
  alternatives: readonly DecisionOption[],
  weights: DimensionWeights,
): TradeoffTable {
  return {
    bestOptionId: best.optionId,
    alternativeIds: alternatives.map((option) => option.optionId),
    rows: SCORE_DIMENSIONS.map((dimension) => ({
      dimension,
      label: DIMENSION_LABELS[dimension],
      weight: weights[dimension],
      best: best.scores[dimension],
      alternatives: alternatives.map((option) => option.scores[dimension]),
      deltas: alternatives.map((option) => option.scores[dimension] - best.scores[dimension]),
    })),
  };
}
