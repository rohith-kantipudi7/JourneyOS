'use client';

import type { JourneyDetail } from '@/types/api';

const STAGE_COLOR: Record<string, string> = {
  event: 'bg-stage-event',
  context: 'bg-stage-context',
  trust: 'bg-stage-trust',
  plan: 'bg-stage-plan',
  validate: 'bg-stage-trust',
  approval: 'bg-stage-content',
  execute: 'bg-stage-action',
  audit: 'bg-stage-audit',
};

const OUTCOME_COLOR: Record<string, string> = {
  success: 'text-emerald-400',
  failure: 'text-rose-400',
  denied: 'text-rose-400',
  skipped: 'text-amber-400',
};

export function AuditTimeline({ audit }: { audit: JourneyDetail['audit'] }) {
  if (audit.length === 0) {
    return <p className="text-muted-foreground text-xs">No audit records yet.</p>;
  }

  return (
    <ol className="space-y-1">
      {[...audit].reverse().map((record) => (
        <li key={record.id} className="border-border flex items-start gap-2 rounded-md border p-2">
          <span
            className={`mt-1 size-1.5 shrink-0 rounded-full ${STAGE_COLOR[record.stage] ?? 'bg-muted'}`}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-[11px]">{record.action}</span>
              <span className={`shrink-0 text-[9px] uppercase ${OUTCOME_COLOR[record.outcome] ?? ''}`}>
                {record.outcome}
              </span>
            </div>
            <p className="text-muted-foreground mt-0.5 text-[11px] leading-snug">{record.summary}</p>
            <p className="text-muted-foreground mt-0.5 text-[9px]">
              {record.stage} · {record.actor} · {new Date(record.occurredAt).toLocaleTimeString()}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
