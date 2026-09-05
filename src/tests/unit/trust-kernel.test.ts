import { describe, expect, it } from 'vitest';

import { TrustKernel } from '@/core/trust';
import { CustomerIds } from '@/core/shared';
import {
  ABSOLUTE_SPEND_CEILING_EUR,
  TRAVEL_POLICY_SET,
  and,
  describeExpression,
  evaluateExpression,
  not,
  or,
  predicate,
  PREDICATES,
  assessRisk,
  rulesFor,
} from '@/policies';
import type { LoyaltyTier, PriorIncidentSummary, ProposedAction, TrustContext } from '@/types';

const EVALUATED_AT = new Date('2026-03-01T12:00:00.000Z');

const CLEAN_HISTORY: PriorIncidentSummary = {
  totalPriorJourneys: 0,
  disruptedJourneys: 0,
  disruptionsLast90Days: 0,
  disruptionEventsLast90Days: 0,
  compensationEventsLast90Days: 0,
  compensationTotalEurLast90Days: 0,
  compensationWithin30Days: false,
  daysSinceLastIncident: null,
  repeatDisruptionRate: 0,
};

/** Mirrors the seeded Gold customer: 2 disruptions, voucher issued 19 days ago. */
const TROUBLED_HISTORY: PriorIncidentSummary = {
  totalPriorJourneys: 3,
  disruptedJourneys: 2,
  disruptionsLast90Days: 2,
  disruptionEventsLast90Days: 2,
  compensationEventsLast90Days: 1,
  compensationTotalEurLast90Days: 120,
  compensationWithin30Days: true,
  daysSinceLastIncident: 19,
  repeatDisruptionRate: 2 / 3,
};

function context(overrides: Partial<TrustContext> = {}): TrustContext {
  return {
    customerId: CustomerIds.generate(),
    loyaltyTier: 'gold',
    loyaltyPoints: 84_500,
    action: { type: 'issueVoucher', estimatedCost: 120, currency: 'EUR' },
    grantedConsents: [
      { channel: 'email', purpose: 'service_updates' },
      { channel: 'push', purpose: 'service_updates' },
      { channel: 'email', purpose: 'automated_rebooking' },
    ],
    priorIncidents: CLEAN_HISTORY,
    contextRisk: 0,
    staleInputs: [],
    evaluatedAt: EVALUATED_AT,
    ...overrides,
  };
}

const kernel = new TrustKernel();

describe('policy expression composition', () => {
  it('renders a nested expression as readable text', () => {
    const expression = and(
      or(predicate('tier.at_least_gold'), predicate('history.fewer_than_two_recent_incidents')),
      predicate('spend.within_tier_cap'),
    );

    expect(describeExpression(expression, PREDICATES)).toBe(
      '((tier is Gold or above OR fewer than 2 disruptions in 90 days) AND spend is within the tier cap)',
    );
  });

  it('satisfies an OR when either branch holds', () => {
    const expression = or(predicate('tier.at_least_gold'), predicate('history.fewer_than_two_recent_incidents'));

    // Silver but clean history.
    const viaHistory = evaluateExpression(expression, PREDICATES, context({ loyaltyTier: 'silver' }));
    expect(viaHistory.satisfied).toBe(true);

    // Gold but a bad record.
    const viaTier = evaluateExpression(
      expression,
      PREDICATES,
      context({ loyaltyTier: 'gold', priorIncidents: TROUBLED_HISTORY }),
    );
    expect(viaTier.satisfied).toBe(true);
  });

  it('fails an OR only when every branch fails', () => {
    const expression = or(predicate('tier.at_least_gold'), predicate('history.fewer_than_two_recent_incidents'));
    const trace = evaluateExpression(
      expression,
      PREDICATES,
      context({ loyaltyTier: 'silver', priorIncidents: TROUBLED_HISTORY }),
    );

    expect(trace.satisfied).toBe(false);
    expect(trace.decidedBy.join(' ')).toContain('below the Gold threshold');
  });

  it('inverts a NOT', () => {
    const expression = not(predicate('history.compensated_recently'));

    expect(evaluateExpression(expression, PREDICATES, context()).satisfied).toBe(true);
    expect(
      evaluateExpression(expression, PREDICATES, context({ priorIncidents: TROUBLED_HISTORY })).satisfied,
    ).toBe(false);
  });

  it('reports only the failing branches of an AND', () => {
    const expression = and(predicate('tier.at_least_gold'), predicate('spend.within_tier_cap'));
    const trace = evaluateExpression(
      expression,
      PREDICATES,
      context({ action: { type: 'issueVoucher', estimatedCost: 5_000, currency: 'EUR' } }),
    );

    expect(trace.satisfied).toBe(false);
    expect(trace.decidedBy).toHaveLength(1);
    expect(trace.decidedBy[0]).toContain('exceeds');
  });

  it('throws on a rule referencing an unregistered predicate', () => {
    expect(() => evaluateExpression(predicate('does.not.exist'), PREDICATES, context())).toThrow(
      /unregistered predicate/,
    );
  });
});

describe('risk model', () => {
  it('produces a weighted score from independent factors', () => {
    const assessment = assessRisk(context());

    expect(assessment.factors.map((f) => f.id)).toEqual([
      'spend',
      'history',
      'freshness',
      'tier',
      'reversibility',
    ]);
    expect(assessment.score).toBeGreaterThanOrEqual(0);
    expect(assessment.score).toBeLessThanOrEqual(100);
  });

  it('raises the score as spend approaches the tier cap', () => {
    const low = assessRisk(context({ action: { type: 'issueVoucher', estimatedCost: 60, currency: 'EUR' } }));
    const high = assessRisk(context({ action: { type: 'issueVoucher', estimatedCost: 580, currency: 'EUR' } }));

    expect(high.score).toBeGreaterThan(low.score);
  });

  it('treats any stale decision-critical input as maximal freshness risk', () => {
    const assessment = assessRisk(
      context({
        staleInputs: [
          { nodeId: 'n1', nodeType: 'Event', sourceSystem: 'travel_inventory', ageSeconds: 900 },
        ],
      }),
    );

    expect(assessment.factors.find((f) => f.id === 'freshness')?.value).toBe(100);
  });

  it('scores an irreversible action higher than a reversible one', () => {
    const notify = assessRisk(context({ action: { type: 'sendNotification', estimatedCost: 0, currency: 'EUR' } }));
    const rebook = assessRisk(context({ action: { type: 'rebookFlight', estimatedCost: 0, currency: 'EUR' } }));

    expect(rebook.score).toBeGreaterThan(notify.score);
  });
});

describe('TrustKernel outcomes', () => {
  it('auto-approves a low-risk action with a clean record', () => {
    const decision = kernel.evaluate(context({ loyaltyTier: 'silver', priorIncidents: CLEAN_HISTORY }));

    expect(decision.outcome).toBe('auto_approve');
    expect(decision.failedRuleIds).toEqual([]);
    expect(decision.checks.every((check) => check.passed)).toBe(true);
    expect(decision.headline).toContain('All policy checks passed');
  });

  it('hard-denies rebooking without automated-rebooking consent', () => {
    const decision = kernel.evaluate(
      context({
        action: { type: 'rebookFlight', estimatedCost: 240, currency: 'EUR' },
        grantedConsents: [{ channel: 'email', purpose: 'service_updates' }],
      }),
    );

    expect(decision.outcome).toBe('hard_deny');
    expect(decision.failedRuleIds).toContain('consent.automated_rebooking');

    const check = decision.checks.find((c) => c.policyId === 'consent.automated_rebooking');
    expect(check?.passed).toBe(false);
    expect(check?.reason).toContain('has not consented to automated rebooking');
  });

  it('hard-denies an action resting on stale inventory', () => {
    const decision = kernel.evaluate(
      context({
        action: { type: 'rebookFlight', estimatedCost: 200, currency: 'EUR' },
        staleInputs: [
          { nodeId: 'fare-1', nodeType: 'Event', sourceSystem: 'travel_inventory', ageSeconds: 1_800 },
        ],
      }),
    );

    expect(decision.outcome).toBe('hard_deny');
    expect(decision.failedRuleIds).toContain('freshness.decision_inputs');

    const check = decision.checks.find((c) => c.policyId === 'freshness.decision_inputs');
    expect(check?.reason).toContain('travel_inventory');
    expect(check?.reason).toContain('30m old');
  });

  it('hard-denies spend beyond the absolute ceiling regardless of tier', () => {
    const decision = kernel.evaluate(
      context({
        loyaltyTier: 'platinum',
        action: { type: 'issueVoucher', estimatedCost: ABSOLUTE_SPEND_CEILING_EUR + 1, currency: 'EUR' },
      }),
    );

    expect(decision.outcome).toBe('hard_deny');
    expect(decision.failedRuleIds).toContain('policy.absolute_ceiling');
  });

  it('ignores consent rules that do not apply to the action type', () => {
    const decision = kernel.evaluate(context({ grantedConsents: [] }));

    // issueVoucher has no consent rule, so an empty consent list is irrelevant.
    expect(decision.checks.some((check) => check.kind === 'consent')).toBe(false);
    expect(decision.outcome).not.toBe('hard_deny');
  });

  it('stamps the policy version onto every evaluation', () => {
    expect(kernel.evaluate(context()).policyVersion).toBe(TRAVEL_POLICY_SET.version);
  });

  it('is deterministic — identical input yields an identical outcome', () => {
    const input = context({ priorIncidents: TROUBLED_HISTORY, contextRisk: 75 });
    const first = kernel.evaluate(input);
    const second = kernel.evaluate(input);

    expect(first.outcome).toBe(second.outcome);
    expect(first.riskScore).toBe(second.riskScore);
    expect(first.checks).toEqual(second.checks);
  });
});

describe('tiering is driven by policy composition', () => {
  const proposedVoucher: ProposedAction = { type: 'issueVoucher', estimatedCost: 120, currency: 'EUR' };

  /** Same event, same action, same cost — only tier and history differ. */
  const goldWithHistory = context({
    loyaltyTier: 'gold',
    action: proposedVoucher,
    priorIncidents: TROUBLED_HISTORY,
    contextRisk: 75,
  });

  const silverWithCleanRecord = context({
    loyaltyTier: 'silver',
    action: proposedVoucher,
    priorIncidents: CLEAN_HISTORY,
    contextRisk: 0,
  });

  it('lands two customers in different tiers from the same proposal', () => {
    const gold = kernel.evaluate(goldWithHistory);
    const silver = kernel.evaluate(silverWithCleanRecord);

    expect(silver.outcome).toBe('auto_approve');
    expect(gold.outcome).toBe('needs_customer_approval');
    expect(gold.outcome).not.toBe(silver.outcome);
  });

  it('attributes the difference to the repeat-compensation rule, not the score', () => {
    const gold = kernel.evaluate(goldWithHistory);

    expect(gold.failedRuleIds).toEqual(['policy.repeat_compensation']);
    // The rule alone escalates it: the score by itself would not have.
    expect(gold.riskScore).toBeLessThan(TRAVEL_POLICY_SET.thresholds.hardDenyAtOrAbove);
    expect(gold.headline).toContain('already issued');
  });

  it('lets Platinum status override the repeat-compensation guard', () => {
    const platinum = kernel.evaluate({ ...goldWithHistory, loyaltyTier: 'platinum' });

    expect(platinum.failedRuleIds).not.toContain('policy.repeat_compensation');
  });

  it('applies the eligibility rule only to compensating actions', () => {
    expect(rulesFor(TRAVEL_POLICY_SET, 'issueVoucher').map((r) => r.id)).toContain('policy.eligibility');
    expect(rulesFor(TRAVEL_POLICY_SET, 'sendNotification').map((r) => r.id)).not.toContain(
      'policy.eligibility',
    );
  });

  it('denies a Silver customer with a bad record who fails both OR branches', () => {
    const decision = kernel.evaluate(
      context({
        loyaltyTier: 'silver',
        action: proposedVoucher,
        priorIncidents: TROUBLED_HISTORY,
        contextRisk: 75,
      }),
    );

    expect(decision.outcome).toBe('hard_deny');
    expect(decision.failedRuleIds).toContain('policy.eligibility');
  });
});

describe('every tier is reachable', () => {
  const outcomes = new Set<string>();

  it('produces auto_approve, needs_customer_approval and hard_deny', () => {
    const tiers: LoyaltyTier[] = ['standard', 'silver', 'gold', 'platinum'];

    for (const tier of tiers) {
      for (const cost of [0, 120, 900, 5_000]) {
        for (const history of [CLEAN_HISTORY, TROUBLED_HISTORY]) {
          outcomes.add(
            kernel.evaluate(
              context({
                loyaltyTier: tier,
                action: { type: 'issueVoucher', estimatedCost: cost, currency: 'EUR' },
                priorIncidents: history,
                contextRisk: history === TROUBLED_HISTORY ? 75 : 0,
              }),
            ).outcome,
          );
        }
      }
    }

    expect(outcomes).toEqual(new Set(['auto_approve', 'needs_customer_approval', 'hard_deny']));
  });
});
