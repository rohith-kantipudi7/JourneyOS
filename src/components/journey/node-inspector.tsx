'use client';

import type { ContextNode } from '@/types';

const formatAge = (seconds: number): string => {
  if (seconds < 90) return `${seconds}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
};

export function NodeInspector({ node }: { node: ContextNode }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-muted-foreground text-[10px] tracking-[0.15em] uppercase">{node.type}</p>
        <p className="mt-0.5 text-sm font-medium">{node.label}</p>
        <p className="text-muted-foreground mt-1 font-mono text-[10px] break-all">{node.id}</p>
      </div>

      <div className="border-border grid grid-cols-3 gap-2 rounded-md border p-2 text-[11px]">
        <div>
          <p className="text-muted-foreground text-[9px] uppercase">Source</p>
          <p className="font-mono">{node.provenance.sourceSystem}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-[9px] uppercase">Age</p>
          <p className="font-mono">{formatAge(node.provenance.ageSeconds)}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-[9px] uppercase">State</p>
          <p className={node.provenance.stale ? 'text-rose-400' : 'text-emerald-400'}>
            {node.provenance.stale ? 'stale' : 'fresh'}
          </p>
        </div>
      </div>

      <div>
        <p className="text-muted-foreground mb-1 text-[10px] tracking-[0.15em] uppercase">Data</p>
        <pre className="border-border bg-card max-h-72 overflow-auto rounded-md border p-2 text-[10px] leading-relaxed">
          {JSON.stringify(node.data, null, 2)}
        </pre>
      </div>
    </div>
  );
}
