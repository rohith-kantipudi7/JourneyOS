'use client';

import { useConsoleContext } from '@/components/journey/console-provider';
import { ContextGraph } from '@/components/journey/context-graph';
import { DecisionPanel } from '@/components/journey/decision-panel';
import { Hint, Panel } from '@/components/journey/panel';
import { CustomerRail } from '@/components/journey/rails';
import { TrustPanel } from '@/components/journey/trust-panel';

/** Decision Inspector — why this recommendation, and what it cost to choose it. */
export default function DecisionInspector() {
  const console = useConsoleContext();
  const decision = console.decision;

  return (
    <div className="grid h-full grid-cols-1 gap-3 overflow-auto p-3 xl:grid-cols-12 xl:overflow-hidden">
      <CustomerRail className="xl:col-span-2" />

      <div className="flex min-h-0 flex-col gap-3 xl:col-span-6">
        <Panel
          title="Decision"
          className="min-h-0 xl:flex-1"
          aside={
            <div className="flex items-center gap-2">
              {decision && (
                <span className="text-muted-foreground font-mono text-[10px]">
                  {decision.planner === 'ai' ? (decision.model ?? 'ai') : 'deterministic'} ·{' '}
                  {Math.round(decision.confidence * 100)}%
                </span>
              )}
              <button
                disabled={console.busy || !console.graph}
                onClick={() => void console.planDecision()}
                className="rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-35"
              >
                {console.busy ? 'Planning…' : 'Re-run planner'}
              </button>
            </div>
          }
        >
          {decision ? (
            <DecisionPanel
              decision={decision}
              busy={console.busy}
              executed={console.executed !== null}
              onExecute={(optionId) => void console.executeOption(optionId)}
            />
          ) : (
            <Hint>
              No proposal for this journey yet.
              <br />
              Press <strong className="text-foreground">Re-run planner</strong> to search alternatives,
              screen them against policy, and rank them.
            </Hint>
          )}
        </Panel>
      </div>

      <div className="flex min-h-0 flex-col gap-3 xl:col-span-4">
        <Panel title="Trust evaluation" className="min-h-72 xl:flex-1">
          {console.trust ? <TrustPanel trust={console.trust} /> : <Hint>No context to evaluate yet.</Hint>}
        </Panel>

        <Panel
          title="Context this decision used"
          className="min-h-56 xl:max-h-[42%]"
          bodyClassName="relative overflow-hidden p-0"
          aside={
            decision && (
              <span className="text-muted-foreground font-mono text-[9px]">
                {decision.snapshotId.slice(0, 12)}…
              </span>
            )
          }
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
      </div>
    </div>
  );
}
