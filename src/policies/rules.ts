import type { ActionType, TrustCheckKind } from '@/types';

import { and, not, or, predicate, type PolicyExpression } from './expressions';

/**
 * What happens when a rule is not satisfied.
 *
 * Tiering lives on the rule, not in the aggregator, so adding a policy cannot
 * accidentally change how existing ones escalate.
 */
export const RULE_FAILURE_EFFECTS = ['hard_deny', 'require_approval', 'warn'] as const;
export type RuleFailureEffect = (typeof RULE_FAILURE_EFFECTS)[number];

export interface PolicyRule {
  readonly id: string;
  readonly label: string;
  readonly kind: TrustCheckKind;
  /** `'all'` applies the rule to every action type. */
  readonly appliesTo: readonly ActionType[] | 'all';
  readonly expression: PolicyExpression;
  readonly onFail: RuleFailureEffect;
  readonly failureReason: string;
}

export interface RiskThresholds {
  /** Below this score, and with no failing rules, the action self-authorizes. */
  readonly autoApproveBelow: number;
  /** At or above this score the action is refused outright. */
  readonly hardDenyAtOrAbove: number;
}

export interface PolicySet {
  readonly version: string;
  readonly rules: readonly PolicyRule[];
  readonly thresholds: RiskThresholds;
}

const COMPENSATING_ACTIONS: readonly ActionType[] = [
  'rebookFlight',
  'issueVoucher',
  'reserveHotel',
  'bookTransport',
];

export const TRAVEL_POLICY_SET: PolicySet = {
  version: 'travel-recovery-1.0.0',
  thresholds: { autoApproveBelow: 35, hardDenyAtOrAbove: 80 },
  rules: [
    {
      id: 'policy.eligibility',
      label: 'Automation eligibility',
      kind: 'policy',
      appliesTo: COMPENSATING_ACTIONS,
      // (tier is Gold OR fewer than 2 recent incidents) AND spend within cap
      expression: and(
        or(predicate('tier.at_least_gold'), predicate('history.fewer_than_two_recent_incidents')),
        predicate('spend.within_tier_cap'),
      ),
      onFail: 'hard_deny',
      failureReason: 'The customer is not eligible for automated recovery at this spend level.',
    },

    {
      id: 'policy.absolute_ceiling',
      label: 'Absolute spend ceiling',
      kind: 'policy',
      appliesTo: 'all',
      expression: predicate('spend.within_absolute_ceiling'),
      onFail: 'hard_deny',
      failureReason: 'The proposed spend exceeds the absolute automation ceiling.',
    },

    {
      id: 'policy.repeat_compensation',
      label: 'Repeat compensation guard',
      kind: 'policy',
      appliesTo: COMPENSATING_ACTIONS,
      // Fine unless we compensated recently — unless the customer is Platinum.
      expression: or(not(predicate('history.compensated_recently')), predicate('tier.at_least_platinum')),
      onFail: 'require_approval',
      failureReason: 'Compensation was already issued recently, so a repeat claim needs sign-off.',
    },

    {
      id: 'consent.automated_rebooking',
      label: 'Automated rebooking consent',
      kind: 'consent',
      appliesTo: ['rebookFlight'],
      expression: predicate('consent.automated_rebooking'),
      onFail: 'hard_deny',
      failureReason: 'The customer has not consented to automated rebooking on their behalf.',
    },

    {
      id: 'consent.notification_channel',
      label: 'Notification consent',
      kind: 'consent',
      appliesTo: ['sendNotification'],
      expression: and(predicate('consent.service_updates'), predicate('consent.requested_channel')),
      onFail: 'hard_deny',
      failureReason: 'The customer has not consented to service updates on the requested channel.',
    },

    {
      id: 'freshness.decision_inputs',
      label: 'Context freshness',
      kind: 'freshness',
      appliesTo: COMPENSATING_ACTIONS,
      expression: predicate('freshness.decision_inputs_current'),
      onFail: 'hard_deny',
      failureReason: 'The decision rests on stale data and cannot be trusted.',
    },
  ],
};

export function rulesFor(policySet: PolicySet, actionType: ActionType): PolicyRule[] {
  return policySet.rules.filter(
    (rule) => rule.appliesTo === 'all' || rule.appliesTo.includes(actionType),
  );
}
