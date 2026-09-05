/**
 * Trust Kernel result types.
 *
 * The kernel is deterministic and returns a *tiered* outcome plus a numeric
 * risk score — never a bare boolean. Phase 4 implements the evaluation logic;
 * these types exist here because decisions and audit records persist them.
 */

import type { CustomerId } from '@/core/shared';

import type { ActionType } from './action';
import type { ConsentChannel, ConsentPurpose } from './consent';
import type { LoyaltyTier } from './customer';
import type { PriorIncidentSummary } from './snapshot';

export const TRUST_OUTCOMES = ['auto_approve', 'needs_customer_approval', 'hard_deny'] as const;
export type TrustOutcome = (typeof TRUST_OUTCOMES)[number];

export const TRUST_CHECK_KINDS = ['consent', 'policy', 'freshness', 'risk'] as const;
export type TrustCheckKind = (typeof TRUST_CHECK_KINDS)[number];

export interface TrustCheck {
  readonly kind: TrustCheckKind;
  readonly policyId: string;
  readonly label: string;
  readonly passed: boolean;
  /** Human-readable justification, surfaced verbatim in the Decision Inspector. */
  readonly reason: string;
}

/** One weighted contributor to the overall risk score. */
export interface RiskFactor {
  readonly id: string;
  readonly label: string;
  /** Normalized 0–100 severity for this factor alone. */
  readonly value: number;
  readonly weight: number;
}

export interface TrustEvaluation {
  readonly outcome: TrustOutcome;
  /** 0–100. Thresholds map the score onto the tiered outcome. */
  readonly riskScore: number;
  readonly riskFactors: readonly RiskFactor[];
  readonly checks: readonly TrustCheck[];
  /** Stamped so an audit record proves exactly which rule set ran. */
  readonly policyVersion: string;
  readonly evaluatedAt: Date;
}

/** The action a proposal wants to take, as far as the Trust Kernel is concerned. */
export interface ProposedAction {
  readonly type: ActionType;
  readonly estimatedCost: number;
  readonly currency: string;
  readonly channel?: ConsentChannel;
}

export interface StaleInput {
  readonly nodeId: string;
  readonly nodeType: string;
  readonly sourceSystem: string;
  readonly ageSeconds: number;
}

export interface GrantedConsent {
  readonly channel: ConsentChannel;
  readonly purpose: ConsentPurpose;
}

/**
 * The complete, serializable input to a Trust Kernel evaluation.
 *
 * Deliberately plain data: the same context always yields the same outcome,
 * and the exact input can be replayed from an audit record.
 */
export interface TrustContext {
  readonly customerId: CustomerId;
  readonly loyaltyTier: LoyaltyTier;
  readonly loyaltyPoints: number;
  readonly action: ProposedAction;
  /** Only grants that are currently active — revoked entries are excluded. */
  readonly grantedConsents: readonly GrantedConsent[];
  readonly priorIncidents: PriorIncidentSummary;
  /** History-derived risk, 0–100, produced by the Context Builder. */
  readonly contextRisk: number;
  readonly staleInputs: readonly StaleInput[];
  readonly evaluatedAt: Date;
}
