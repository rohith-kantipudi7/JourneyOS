import { PREDICATES, TRAVEL_POLICY_SET, assessRisk, evaluateExpression, rulesFor } from '@/policies';
import type { PolicySet, PredicateRegistry, RiskFactorDefinition } from '@/policies';
import { RISK_FACTORS } from '@/policies';
import type { TrustCheck, TrustContext, TrustEvaluation, TrustOutcome } from '@/types';

export interface TrustKernelOptions {
  readonly policySet?: PolicySet;
  readonly predicates?: PredicateRegistry;
  readonly riskFactors?: readonly RiskFactorDefinition[];
}

export interface TrustDecision extends TrustEvaluation {
  /** The rules that failed, in the order they were evaluated. */
  readonly failedRuleIds: readonly string[];
  /** One-line justification suitable for showing a customer. */
  readonly headline: string;
}

/**
 * Trust Kernel — stage 3 of the control loop.
 *
 * Deterministic by construction: no LLM calls, no I/O, no clock reads beyond
 * the timestamp carried on the context. The same input always produces the
 * same outcome, which is what makes the audit trail meaningful.
 *
 * Enforced by an ESLint boundary in `eslint.config.mjs`.
 */
export class TrustKernel {
  private readonly policySet: PolicySet;
  private readonly predicates: PredicateRegistry;
  private readonly riskFactors: readonly RiskFactorDefinition[];

  constructor(options: TrustKernelOptions = {}) {
    this.policySet = options.policySet ?? TRAVEL_POLICY_SET;
    this.predicates = options.predicates ?? PREDICATES;
    this.riskFactors = options.riskFactors ?? RISK_FACTORS;
  }

  evaluate(context: TrustContext): TrustDecision {
    const applicable = rulesFor(this.policySet, context.action.type);
    const checks: TrustCheck[] = [];
    const failedRuleIds: string[] = [];

    let hardDenied = false;
    let approvalRequired = false;

    for (const rule of applicable) {
      const trace = evaluateExpression(rule.expression, this.predicates, context);

      checks.push({
        kind: rule.kind,
        policyId: rule.id,
        label: rule.label,
        passed: trace.satisfied,
        reason: trace.satisfied
          ? trace.decidedBy.join(' ')
          : `${rule.failureReason} ${trace.decidedBy.join(' ')}`.trim(),
      });

      if (trace.satisfied) continue;

      failedRuleIds.push(rule.id);
      if (rule.onFail === 'hard_deny') hardDenied = true;
      if (rule.onFail === 'require_approval') approvalRequired = true;
    }

    const risk = assessRisk(context, this.riskFactors);
    const { autoApproveBelow, hardDenyAtOrAbove } = this.policySet.thresholds;

    checks.push({
      kind: 'risk',
      policyId: 'risk.composite_score',
      label: 'Composite risk score',
      passed: risk.score < hardDenyAtOrAbove,
      reason: `Weighted risk score is ${risk.score}/100 (auto-approve below ${autoApproveBelow}, deny at ${hardDenyAtOrAbove}).`,
    });

    const outcome = this.resolveOutcome({
      hardDenied,
      approvalRequired,
      score: risk.score,
      autoApproveBelow,
      hardDenyAtOrAbove,
    });

    return {
      outcome,
      riskScore: risk.score,
      riskFactors: risk.factors,
      checks,
      policyVersion: this.policySet.version,
      evaluatedAt: context.evaluatedAt,
      failedRuleIds,
      headline: this.headlineFor(outcome, checks, failedRuleIds, risk.score),
    };
  }

  /** A hard policy breach always wins; otherwise the score decides the tier. */
  private resolveOutcome(input: {
    hardDenied: boolean;
    approvalRequired: boolean;
    score: number;
    autoApproveBelow: number;
    hardDenyAtOrAbove: number;
  }): TrustOutcome {
    if (input.hardDenied) return 'hard_deny';
    if (input.score >= input.hardDenyAtOrAbove) return 'hard_deny';
    if (input.approvalRequired) return 'needs_customer_approval';
    return input.score < input.autoApproveBelow ? 'auto_approve' : 'needs_customer_approval';
  }

  private headlineFor(
    outcome: TrustOutcome,
    checks: readonly TrustCheck[],
    failedRuleIds: readonly string[],
    score: number,
  ): string {
    if (failedRuleIds.length > 0) {
      const first = checks.find((check) => check.policyId === failedRuleIds[0]);
      return first?.reason ?? 'A policy check did not pass.';
    }

    switch (outcome) {
      case 'auto_approve':
        return `All policy checks passed and risk is low (${score}/100).`;
      case 'needs_customer_approval':
        return `All policy checks passed, but risk is elevated (${score}/100), so the customer must approve.`;
      case 'hard_deny':
        return `Risk score ${score}/100 exceeds the automation ceiling.`;
    }
  }
}
