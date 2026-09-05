'use client';

import { useMemo, useState } from 'react';

import { AuditTimeline } from '@/components/journey/audit-timeline';
import { useConsoleContext } from '@/components/journey/console-provider';
import { ContextGraph } from '@/components/journey/context-graph';
import { JourneyHeader } from '@/components/journey/journey-header';
import { Hint, Panel } from '@/components/journey/panel';
import { CustomerRail } from '@/components/journey/rails';

const STAGES = ['event', 'context', 'trust', 'plan', 'validate', 'approval', 'execute', 'audit'] as const;

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

/** Audit Viewer — the full trace, filterable by control-loop stage. */
export default function AuditViewer() {
  const console = useConsoleContext();
  const [stage, setStage] = useState<string | null>(null);

  const records = useMemo(() => console.detail?.audit ?? [], [console.detail]);
  const counts = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const record of records) tally[record.stage] = (tally[record.stage] ?? 0) + 1;
    return tally;
  }, [records]);

  const filtered = stage ? records.filter((record) => record.stage === stage) : records;

  return (
    <div className="grid h-full grid-cols-1 gap-3 overflow-auto p-3 xl:grid-cols-12 xl:overflow-hidden">
      <CustomerRail className="xl:col-span-2" />

      <div className="flex min-h-0 flex-col gap-3 xl:col-span-6">
        {console.detail && (
          <div className="shrink-0">
            <JourneyHeader detail={console.detail} />
          </div>
        )}

        <Panel
          title="Audit trail"
          className="min-h-0 xl:flex-1"
          aside={
            <span className="text-muted-foreground font-mono text-[10px]">
              {filtered.length} of {records.length}
            </span>
          }
        >
          <div className="mb-3 flex flex-wrap gap-1">
            <button
              onClick={() => setStage(null)}
              className={`rounded border px-2 py-0.5 text-[10px] ${
                stage === null ? 'border-white/50 bg-white/10' : 'border-border text-muted-foreground'
              }`}
            >
              all
            </button>
            {STAGES.map((name) => (
              <button
                key={name}
                disabled={!counts[name]}
                onClick={() => setStage(stage === name ? null : name)}
                className={`flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] disabled:opacity-30 ${
                  stage === name ? 'border-white/50 bg-white/10' : 'border-border text-muted-foreground'
                }`}
              >
                <span className={`size-1.5 rounded-full ${STAGE_COLOR[name]}`} aria-hidden />
                {name}
                {counts[name] ? <span className="opacity-60">{counts[name]}</span> : null}
              </button>
            ))}
          </div>

          {filtered.length > 0 ? (
            <AuditTimeline audit={filtered} />
          ) : (
            <Hint>No audit records for this journey yet.</Hint>
          )}
        </Panel>
      </div>

      <div className="flex min-h-0 flex-col gap-3 xl:col-span-4">
        <Panel
          title="Context at time of decision"
          className="min-h-72 xl:flex-1"
          bodyClassName="relative overflow-hidden p-0"
        >
          {console.graph ? (
            <ContextGraph
              compact
              graph={console.graph}
              selectedNodeId={console.selectedNode?.id ?? null}
              onSelectNode={console.setSelectedNode}
            />
          ) : (
            <Hint>No snapshot yet.</Hint>
          )}
        </Panel>

        <Panel title="Provenance" className="min-h-40 xl:max-h-[34%]">
          {console.graph ? (
            <div className="space-y-2 text-[11px]">
              <p className="text-muted-foreground">
                Snapshot <span className="font-mono">{console.graph.snapshotId}</span>
              </p>
              <p className="text-muted-foreground">
                {console.graph.stats.nodeCount} nodes · {console.graph.stats.edgeCount} edges · depth{' '}
                {console.graph.stats.maxDepthFromJourney}
              </p>
              {console.graph.staleNodes.length > 0 && (
                <div>
                  <p className="mb-1 text-amber-400">Inputs past their freshness budget:</p>
                  <ul className="space-y-0.5">
                    {console.graph.staleNodes.map((node) => (
                      <li key={node.id} className="text-muted-foreground">
                        · {node.type} — {Math.round(node.ageSeconds / 86400)}d old
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <Hint>No snapshot yet.</Hint>
          )}
        </Panel>
      </div>
    </div>
  );
}
