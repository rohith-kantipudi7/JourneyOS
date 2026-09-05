'use client';

import type { DecisionResponse } from '@/types/api';

const PLANNER_LABEL: Record<string, string> = {
  ai: 'AI planner',
  deterministic_fallback: 'Deterministic fallback',
};

function ScoreBar({ value }: { value: number }) {
  return (
    <div className="bg-muted h-1 w-full overflow-hidden rounded-full">
      <div className="h-full rounded-full bg-white/55" style={{ width: `${value}%` }} />
    </div>
  );
}

interface DecisionPanelProps {
  decision: DecisionResponse;
  busy: boolean;
  executed: boolean;
  onExecute: (optionId: string) => void;
}

export function DecisionPanel({ decision, busy, executed, onExecute }: DecisionPanelProps) {
  const options = [decision.bestOption, ...decision.alternatives];
  const blocked = decision.trust.outcome === 'hard_deny';

  return (
    <div className="space-y-4">
      <div className="border-border rounded-lg border p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-semibold">{decision.bestOption.label}</span>
          <span className="font-mono text-[10px]">
            score {decision.bestOption.weightedScore} · €{decision.bestOption.estimatedCost}
          </span>
        </div>
        <p className="text-muted-foreground mt-1 text-[11px] leading-snug">{decision.reasoning}</p>
        <p className="text-muted-foreground mt-2 text-[10px]">
          {PLANNER_LABEL[decision.planner] ?? decision.planner}
          {decision.model ? ` · ${decision.model}` : ''} · confidence{' '}
          {Math.round(decision.confidence * 100)}% · prompt {decision.promptVersion}
        </p>
      </div>

      <div>
        <h4 className="text-muted-foreground mb-2 text-[10px] font-medium tracking-[0.15em] uppercase">
          Ranked options
        </h4>
        <ul className="space-y-1.5">
          {options.map((option) => (
            <li
              key={option.optionId}
              className={`rounded-md border p-2 ${
                option.rank === 1 ? 'border-white/50 bg-white/5' : 'border-border'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium">
                  #{option.rank} {option.label}
                </span>
                <span className="font-mono text-[10px]">{option.weightedScore}</span>
              </div>
              <p className="text-muted-foreground mt-0.5 text-[10px] leading-snug">{option.summary}</p>
              <ul className="text-muted-foreground mt-1 space-y-0.5 text-[9px]">
                {option.evidence.slice(0, 3).map((line) => (
                  <li key={line}>· {line}</li>
                ))}
              </ul>
              <button
                disabled={busy || blocked || executed}
                onClick={() => onExecute(option.optionId)}
                className="mt-2 w-full rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-35"
              >
                {executed ? 'Already executed' : blocked ? 'Blocked by Trust Kernel' : 'Approve & execute'}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h4 className="text-muted-foreground mb-2 text-[10px] font-medium tracking-[0.15em] uppercase">
          Tradeoff table
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 text-left font-normal">Dimension</th>
                <th className="py-1 text-right font-normal">wt</th>
                <th className="py-1 text-right font-normal">#1</th>
                {decision.tradeoff.alternativeIds.map((id, index) => (
                  <th key={id} className="py-1 text-right font-normal">
                    #{index + 2}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {decision.tradeoff.rows.map((row) => (
                <tr key={row.dimension} className="border-border border-t">
                  <td className="py-1">
                    <span>{row.label}</span>
                    <ScoreBar value={row.best} />
                  </td>
                  <td className="text-muted-foreground py-1 text-right font-mono">{row.weight}</td>
                  <td className="py-1 text-right font-mono">{row.best}</td>
                  {row.alternatives.map((value, index) => (
                    <td
                      key={`${row.dimension}-${index}`}
                      className={`py-1 text-right font-mono ${
                        (row.deltas[index] ?? 0) > 0 ? 'text-emerald-400' : 'text-muted-foreground'
                      }`}
                    >
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {decision.screenedOut.length > 0 && (
        <div>
          <h4 className="text-muted-foreground mb-1 text-[10px] font-medium tracking-[0.15em] uppercase">
            Screened out before ranking
          </h4>
          <ul className="space-y-1">
            {decision.screenedOut.map((entry) => (
              <li key={entry.optionId} className="text-[10px] text-rose-300">
                {entry.optionId} — {entry.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
