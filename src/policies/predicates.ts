import type { LoyaltyTier, TrustContext } from '@/types';

import type { PolicyPredicate, PredicateRegistry } from './expressions';

/**
 * Maximum change cost JourneyOS may commit without human sign-off, per tier.
 * These govern rebooking authority — the fare difference plus fees — not the
 * value of the ticket itself.
 */
export const TIER_SPEND_CAP_EUR: Readonly<Record<LoyaltyTier, number>> = {
  standard: 250,
  bronze: 400,
  silver: 600,
  gold: 1000,
  platinum: 2000,
};

/** No automated action may exceed this, whatever the tier. */
export const ABSOLUTE_SPEND_CEILING_EUR = 3000;

const TIER_RANK: Readonly<Record<LoyaltyTier, number>> = {
  standard: 0,
  bronze: 1,
  silver: 2,
  gold: 3,
  platinum: 4,
};

/** Sources whose staleness makes an action unsafe rather than merely noteworthy. */
export const DECISION_CRITICAL_SOURCES = ['travel_inventory', 'event_store', 'derived'] as const;

export const tierAtLeast = (tier: LoyaltyTier) => (context: TrustContext) =>
  TIER_RANK[context.loyaltyTier] >= TIER_RANK[tier];

export const spendCapFor = (context: TrustContext): number => TIER_SPEND_CAP_EUR[context.loyaltyTier];

export const hasConsent = (context: TrustContext, purpose: string, channel?: string): boolean =>
  context.grantedConsents.some(
    (grant) => grant.purpose === purpose && (channel === undefined || grant.channel === channel),
  );

function define(
  id: string,
  label: string,
  evaluate: (context: TrustContext) => boolean,
  explain: (context: TrustContext, satisfied: boolean) => string,
): PolicyPredicate {
  return { id, label, evaluate, explain };
}

/**
 * Named, reusable predicates. Rules reference these by id, so the policy set
 * stays declarative data and the logic lives in exactly one place.
 */
export const PREDICATES: PredicateRegistry = Object.freeze(
  Object.fromEntries(
    [
      define(
        'tier.at_least_gold',
        'tier is Gold or above',
        tierAtLeast('gold'),
        (ctx, ok) =>
          ok
            ? `Customer is ${ctx.loyaltyTier}, which meets the Gold threshold.`
            : `Customer is ${ctx.loyaltyTier}, below the Gold threshold.`,
      ),

      define(
        'tier.at_least_platinum',
        'tier is Platinum',
        tierAtLeast('platinum'),
        (ctx, ok) =>
          ok ? 'Customer is Platinum.' : `Customer is ${ctx.loyaltyTier}, not Platinum.`,
      ),

      define(
        'history.fewer_than_two_recent_incidents',
        'fewer than 2 disruptions in 90 days',
        (ctx) => ctx.priorIncidents.disruptionsLast90Days < 2,
        (ctx, ok) =>
          ok
            ? `Only ${ctx.priorIncidents.disruptionsLast90Days} disruption(s) in the last 90 days.`
            : `${ctx.priorIncidents.disruptionsLast90Days} disruptions in the last 90 days.`,
      ),

      define(
        'history.compensated_recently',
        'compensation issued in the last 30 days',
        (ctx) => ctx.priorIncidents.compensationWithin30Days,
        (ctx, ok) =>
          ok
            ? `€${ctx.priorIncidents.compensationTotalEurLast90Days} of compensation was already issued within the last 30 days.`
            : 'No compensation issued in the last 30 days.',
      ),

      define(
        'spend.within_tier_cap',
        'spend is within the tier cap',
        (ctx) => ctx.action.estimatedCost <= spendCapFor(ctx),
        (ctx, ok) =>
          ok
            ? `€${ctx.action.estimatedCost} is within the €${spendCapFor(ctx)} ${ctx.loyaltyTier} cap.`
            : `€${ctx.action.estimatedCost} exceeds the €${spendCapFor(ctx)} ${ctx.loyaltyTier} cap.`,
      ),

      define(
        'spend.within_absolute_ceiling',
        'spend is within the absolute ceiling',
        (ctx) => ctx.action.estimatedCost <= ABSOLUTE_SPEND_CEILING_EUR,
        (ctx, ok) =>
          ok
            ? `€${ctx.action.estimatedCost} is within the €${ABSOLUTE_SPEND_CEILING_EUR} automation ceiling.`
            : `€${ctx.action.estimatedCost} exceeds the €${ABSOLUTE_SPEND_CEILING_EUR} automation ceiling.`,
      ),

      define(
        'consent.automated_rebooking',
        'automated rebooking consent is granted',
        (ctx) => hasConsent(ctx, 'automated_rebooking'),
        (_ctx, ok) =>
          ok
            ? 'Customer granted consent for automated rebooking.'
            : 'Customer has not granted consent for automated rebooking.',
      ),

      define(
        'consent.service_updates',
        'a service-update channel is consented',
        (ctx) => hasConsent(ctx, 'service_updates'),
        (_ctx, ok) =>
          ok
            ? 'Customer accepts service updates on at least one channel.'
            : 'Customer accepts service updates on no channel.',
      ),

      define(
        'consent.requested_channel',
        'the requested channel is consented',
        (ctx) =>
          ctx.action.channel === undefined ||
          hasConsent(ctx, 'service_updates', ctx.action.channel),
        (ctx, ok) =>
          ok
            ? `Channel ${ctx.action.channel ?? 'any'} is consented for service updates.`
            : `Channel ${ctx.action.channel} is not consented for service updates.`,
      ),

      define(
        'freshness.decision_inputs_current',
        'decision-critical inputs are current',
        (ctx) =>
          !ctx.staleInputs.some((input) =>
            (DECISION_CRITICAL_SOURCES as readonly string[]).includes(input.sourceSystem),
          ),
        (ctx, ok) => {
          if (ok) return 'All decision-critical inputs are within their freshness budget.';
          const offenders = ctx.staleInputs
            .filter((input) => (DECISION_CRITICAL_SOURCES as readonly string[]).includes(input.sourceSystem))
            .map((input) => `${input.sourceSystem} (${Math.round(input.ageSeconds / 60)}m old)`);
          return `Stale decision-critical input(s): ${offenders.join(', ')}.`;
        },
      ),
    ].map((p) => [p.id, p] as const),
  ),
);
