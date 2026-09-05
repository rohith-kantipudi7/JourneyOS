import type { DimensionScores, RecoveryCandidate } from '@/types';

import type { ScoredCandidate } from './scoring';

/**
 * Deterministic fallback planner.
 *
 * Derives per-dimension scores directly from candidate attributes using plain
 * arithmetic. This is a first-class path, not an error handler: JourneyOS must
 * produce a defensible recommendation with no AI credentials at all.
 */

const normalize = (value: number, best: number, worst: number): number => {
  if (best === worst) return 50;
  return Math.round(Math.min(100, Math.max(0, ((worst - value) / (worst - best)) * 100)));
};

const CABIN_COMFORT: Record<string, number> = {
  first: 100,
  business: 85,
  premium_economy: 65,
  economy: 45,
};

export function scoreCandidatesDeterministically(
  candidates: readonly RecoveryCandidate[],
): ScoredCandidate[] {
  const costs = candidates.map((candidate) => candidate.cost);
  const arrivals = candidates.map((candidate) => candidate.arrivalDeltaMinutes);
  const emissions = candidates.map((candidate) => candidate.co2Kg);

  const bounds = {
    costBest: Math.min(...costs),
    costWorst: Math.max(...costs),
    arrivalBest: Math.min(...arrivals),
    arrivalWorst: Math.max(...arrivals),
    co2Best: Math.min(...emissions),
    co2Worst: Math.max(...emissions),
  };

  return candidates.map((candidate) => {
    const scores: DimensionScores = {
      arrivalTime: normalize(candidate.arrivalDeltaMinutes, bounds.arrivalBest, bounds.arrivalWorst),
      cost: normalize(candidate.cost, bounds.costBest, bounds.costWorst),
      comfort: Math.max(0, (CABIN_COMFORT[candidate.cabin] ?? 50) - candidate.stops * 12),
      // Keeping the customer whole on cabin and routing protects the relationship.
      loyaltyImpact: Math.max(0, (CABIN_COMFORT[candidate.cabin] ?? 50) - candidate.stops * 8),
      sustainability: normalize(candidate.co2Kg, bounds.co2Best, bounds.co2Worst),
      rebookingRisk: Math.round(
        candidate.confirmationLikelihood * 100 * (candidate.seatsAvailable >= 3 ? 1 : 0.8),
      ),
    };

    return {
      optionId: candidate.id,
      label: candidate.label,
      summary: candidate.summary,
      actionType: candidate.actionType,
      scores,
      estimatedCost: candidate.cost,
      currency: candidate.currency,
      evidence: [
        `${candidate.stops === 0 ? 'Direct' : `${candidate.stops} stop`} · ${candidate.cabin.replace('_', ' ')}`,
        `${candidate.seatsAvailable} seat(s) available · ${Math.round(candidate.confirmationLikelihood * 100)}% confirmation likelihood`,
        `${candidate.co2Kg} kg CO₂ · €${candidate.cost}`,
      ],
      executionParams: candidate.executionParams,
    };
  });
}

export function fallbackReasoning(best: { label: string }, priority: string): string {
  return `Selected ${best.label} by deterministic scoring against the customer's stated priority (${priority.replace('_', ' ')}). No AI planner was available, so per-dimension scores were derived directly from fare, routing, cabin, emissions, and seat availability.`;
}
