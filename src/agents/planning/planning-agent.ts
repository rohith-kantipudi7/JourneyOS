import { z } from 'zod';

import { SCORE_DIMENSIONS, type RecoveryCandidate } from '@/types';

import type { ProblemStatement } from '../sense/sense-agent';
import { callStructured } from '../shared/structured';

export const PLANNING_PROMPT_VERSION = 'planning-1.0.0';

const dimensionScoreSchema = z.object(
  Object.fromEntries(SCORE_DIMENSIONS.map((d) => [d, z.number().min(0).max(100)])) as Record<
    (typeof SCORE_DIMENSIONS)[number],
    z.ZodNumber
  >,
);

export const plannedOptionSchema = z.object({
  optionId: z.string().min(1),
  rationale: z.string().min(10).max(600),
  scores: dimensionScoreSchema,
  // Generous upper bounds: these are presentation limits, not safety limits,
  // and discarding a sound plan over one extra bullet is the wrong trade.
  evidence: z.array(z.string().min(3).max(400)).min(1).max(10),
});

export const planSchema = z.object({
  /** Scores only — the model never assigns ranks; deterministic code does that. */
  options: z.array(plannedOptionSchema).min(1).max(10),
  reasoning: z.string().min(20).max(2500),
  confidence: z.number().min(0).max(1),
});

export type Plan = z.infer<typeof planSchema>;

const SYSTEM = `You are the Planning Agent inside JourneyOS.
You score pre-approved recovery options on six named dimensions. You never invent options, never choose a
winner, and never rank. Deterministic code outside you applies the weights and decides the order.

Score each dimension 0-100 where 100 is always BEST FOR THE CUSTOMER:
- arrivalTime: 100 = arrives comfortably before the deadline; 0 = badly late
- cost: 100 = cheapest acceptable; 0 = most expensive
- comfort: 100 = direct, premium cabin; 0 = many stops, downgraded
- loyaltyImpact: 100 = protects or improves the customer relationship; 0 = damages it
- sustainability: 100 = lowest emissions; 0 = highest
- rebookingRisk: 100 = certain to be confirmed; 0 = very likely to fail

Only score the option ids supplied. Respond with a single JSON object matching the schema exactly.`;

function describeCandidates(candidates: readonly RecoveryCandidate[]): string {
  return candidates
    .map(
      (candidate) =>
        `- id=${candidate.id} | ${candidate.label} | €${candidate.cost} ${candidate.currency} | ` +
        `arrival delta ${candidate.arrivalDeltaMinutes}m vs deadline | stops=${candidate.stops} | ` +
        `cabin=${candidate.cabin} | co2=${candidate.co2Kg}kg | seats=${candidate.seatsAvailable} | ` +
        `confirmation=${Math.round(candidate.confirmationLikelihood * 100)}%`,
    )
    .join('\n');
}

export interface PlanResult {
  readonly plan: Plan | null;
  readonly source: 'ai' | 'deterministic';
  readonly model: string | null;
  readonly rejectionReason: string | null;
}

export async function runPlanningAgent(
  statement: ProblemStatement,
  candidates: readonly RecoveryCandidate[],
): Promise<PlanResult> {
  const result = await callStructured({
    schema: planSchema,
    schemaName: 'Plan',
    system: SYSTEM,
    user: [
      `Problem: ${statement.disruptionSummary}`,
      `Customer goal: ${statement.customerGoal}`,
      `Hard constraints: ${statement.hardConstraints.join('; ') || 'none'}`,
      `Soft preferences: ${statement.softPreferences.join('; ') || 'none'}`,
      `Urgency: ${statement.urgency}`,
      '',
      'Options to score (these have already passed policy screening):',
      describeCandidates(candidates),
      '',
      'Return the scoring JSON.',
    ].join('\n'),
  });

  if (result.ok && result.data) {
    const known = new Set(candidates.map((candidate) => candidate.id));
    const unknown = result.data.options.filter((option) => !known.has(option.optionId));

    if (unknown.length > 0) {
      // The model hallucinated an option id, so the whole response is discarded.
      return {
        plan: null,
        source: 'deterministic',
        model: null,
        rejectionReason: `Plan referenced unknown option ids: ${unknown.map((o) => o.optionId).join(', ')}`,
      };
    }

    return { plan: result.data, source: 'ai', model: result.model ?? null, rejectionReason: null };
  }

  return {
    plan: null,
    source: 'deterministic',
    model: null,
    rejectionReason: result.failure === 'unavailable' ? null : (result.failure ?? 'unknown'),
  };
}
