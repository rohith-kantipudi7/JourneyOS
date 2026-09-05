'use client';

import type { TrustResponse } from '@/types/api';

const OUTCOME_STYLE: Record<string, { label: string; className: string }> = {
  auto_approve: { label: 'Auto-approve', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' },
  needs_customer_approval: {
    label: 'Needs customer approval',
    className: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  },
  hard_deny: { label: 'Hard deny', className: 'bg-rose-500/15 text-rose-300 border-rose-500/40' },
};

const KIND_LABEL: Record<string, string> = {
  consent: 'Consent',
  policy: 'Policy',
  freshness: 'Freshness',
  risk: 'Risk',
};

export function TrustPanel({ trust }: { trust: TrustResponse }) {
  const outcome = OUTCOME_STYLE[trust.outcome] ?? {
    label: trust.outcome,
    className: 'bg-muted text-muted-foreground border-border',
  };

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-[10px] leading-snug">
        Asks the Trust Kernel: <em>if we tried this action at this cost right now, would it be allowed?</em>{' '}
        Change the action or amount above to probe different verdicts.
      </p>

      <div className={`rounded-lg border p-3 ${outcome.className}`}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold">{outcome.label}</span>
          <span className="font-mono text-xs">risk {trust.riskScore}/100</span>
        </div>
        <p className="mt-1.5 text-xs opacity-90">{trust.headline}</p>
      </div>

      <div>
        <h4 className="text-muted-foreground mb-2 text-[10px] font-medium tracking-[0.15em] uppercase">
          Policy checks
        </h4>
        <ul className="space-y-1.5">
          {trust.checks.map((check) => (
            <li key={check.policyId} className="border-border rounded-md border p-2">
              <div className="flex items-start gap-2">
                <span
                  className={`mt-1 size-1.5 shrink-0 rounded-full ${check.passed ? 'bg-emerald-400' : 'bg-rose-400'}`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-medium">{check.label}</span>
                    <span className="text-muted-foreground shrink-0 text-[9px] tracking-wide uppercase">
                      {KIND_LABEL[check.kind] ?? check.kind}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-[11px] leading-snug">{check.reason}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h4 className="text-muted-foreground mb-2 text-[10px] font-medium tracking-[0.15em] uppercase">
          Weighted risk factors
        </h4>
        <ul className="space-y-1.5">
          {trust.riskFactors.map((factor) => (
            <li key={factor.id} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-[11px]">
                <span>{factor.label}</span>
                <span className="text-muted-foreground font-mono">
                  {factor.value} × {factor.weight}
                </span>
              </div>
              <div className="bg-muted h-1 overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full bg-white/50"
                  style={{ width: `${Math.min(100, factor.value)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-muted-foreground text-[10px]">
        Policy set <span className="font-mono">{trust.policyVersion}</span> · evaluated deterministically, no
        LLM involved
      </p>
    </div>
  );
}
