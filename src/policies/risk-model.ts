import type { ActionType, LoyaltyTier, RiskFactor, TrustContext } from '@/types';

import { DECISION_CRITICAL_SOURCES, spendCapFor } from './predicates';

/**
 * Weighted risk model.
 *
 * A single boolean cannot express "this is probably fine but worth a glance".
 * Each factor scores 0–100 independently and the weighted mean produces the
 * final score, so the Decision Inspector can show *why* a number came out high.
 */
export interface RiskFactorDefinition {
  readonly id: string;
  readonly label: string;
  readonly weight: number;
  compute(context: TrustContext): number;
}

/** Established relationships carry less risk than brand-new ones. */
const TIER_RISK: Readonly<Record<LoyaltyTier, number>> = {
  standard: 70,
  bronze: 55,
  silver: 40,
  gold: 20,
  platinum: 10,
};

/** How hard an action is to undo if it turns out to be wrong. */
const IRREVERSIBILITY: Readonly<Record<ActionType, number>> = {
  rebookFlight: 80,
  reserveHotel: 70,
  bookTransport: 60,
  issueVoucher: 60,
  createSupportCase: 20,
  sendNotification: 20,
  escalateHuman: 10,
};

const clamp = (value: number): number => Math.min(100, Math.max(0, value));

export const RISK_FACTORS: readonly RiskFactorDefinition[] = [
  {
    id: 'spend',
    label: 'Spend against tier cap',
    weight: 0.3,
    compute: (ctx) => clamp((ctx.action.estimatedCost / spendCapFor(ctx)) * 100),
  },
  {
    id: 'history',
    label: 'Prior incident history',
    weight: 0.3,
    compute: (ctx) => clamp(ctx.contextRisk),
  },
  {
    id: 'freshness',
    label: 'Context freshness',
    weight: 0.2,
    compute: (ctx) => {
      const critical = ctx.staleInputs.filter((input) =>
        (DECISION_CRITICAL_SOURCES as readonly string[]).includes(input.sourceSystem),
      );
      if (critical.length > 0) return 100;
      return clamp(ctx.staleInputs.length * 10);
    },
  },
  {
    id: 'tier',
    label: 'Relationship maturity',
    weight: 0.1,
    compute: (ctx) => TIER_RISK[ctx.loyaltyTier],
  },
  {
    id: 'reversibility',
    label: 'Action reversibility',
    weight: 0.1,
    compute: (ctx) => IRREVERSIBILITY[ctx.action.type],
  },
];

export interface RiskAssessment {
  readonly score: number;
  readonly factors: readonly RiskFactor[];
}

export function assessRisk(
  context: TrustContext,
  definitions: readonly RiskFactorDefinition[] = RISK_FACTORS,
): RiskAssessment {
  const factors: RiskFactor[] = definitions.map((definition) => ({
    id: definition.id,
    label: definition.label,
    value: Math.round(definition.compute(context)),
    weight: definition.weight,
  }));

  const totalWeight = factors.reduce((sum, factor) => sum + factor.weight, 0);
  const weighted = factors.reduce((sum, factor) => sum + factor.value * factor.weight, 0);

  return { score: Math.round(totalWeight === 0 ? 0 : weighted / totalWeight), factors };
}
