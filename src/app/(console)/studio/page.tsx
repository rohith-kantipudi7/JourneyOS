'use client';

import { AuditTimeline } from '@/components/journey/audit-timeline';
import { useConsoleContext } from '@/components/journey/console-provider';
import { ContextGraph } from '@/components/journey/context-graph';
import { JourneyHeader } from '@/components/journey/journey-header';
import { NodeInspector } from '@/components/journey/node-inspector';
import { Hint, Panel } from '@/components/journey/panel';
import { CustomerRail, SimulatorRail } from '@/components/journey/rails';
import { TrustPanel } from '@/components/journey/trust-panel';

const ACTIONS = [
  { type: 'issueVoucher', label: 'Issue voucher', cost: 120 },
  { type: 'rebookFlight', label: 'Rebook flight', cost: 240 },
  { type: 'reserveHotel', label: 'Reserve hotel', cost: 180 },
  { type: 'sendNotification', label: 'Send notification', cost: 0 },
] as const;

/** Journey Studio — the operator view, built around a full-size context graph. */
export default function JourneyStudio() {
  const console = useConsoleContext();

  return (
    <div className="grid h-full grid-cols-1 gap-3 overflow-auto p-3 xl:grid-cols-12 xl:overflow-hidden">
      <div className="flex min-h-0 flex-col gap-3 xl:col-span-3">
        <CustomerRail className="max-h-[42%]" />
        <SimulatorRail className="xl:flex-1" />
      </div>

      <div className="flex min-h-0 flex-col gap-3 xl:col-span-6">
        {console.detail && (
          <div className="shrink-0">
            <JourneyHeader detail={console.detail} />
          </div>
        )}

        <Panel
          title="Journey context graph"
          className="min-h-[420px] xl:flex-1"
          bodyClassName="relative overflow-hidden p-0"
          aside={
            <div className="flex items-center gap-2">
              {console.graph && (
                <span className="text-muted-foreground font-mono text-[10px]">
                  {console.graph.stats.nodeCount}n · {console.graph.stats.edgeCount}e · depth{' '}
                  {console.graph.stats.maxDepthFromJourney}
                </span>
              )}
              <button
                disabled={console.busy || !console.graph}
                onClick={() => void console.planDecision()}
                className="rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-35"
              >
                {console.busy ? 'Planning…' : 'Run planner'}
              </button>
            </div>
          }
        >
          {console.graph ? (
            <ContextGraph
              graph={console.graph}
              selectedNodeId={console.selectedNode?.id ?? null}
              onSelectNode={console.setSelectedNode}
            />
          ) : (
            <Hint>
              This journey has no events yet, so there is nothing to reason about.
              <br />
              <strong className="text-foreground">Fire an event on the left</strong> to build the graph.
            </Hint>
          )}
        </Panel>
      </div>

      <div className="flex min-h-0 flex-col gap-3 xl:col-span-3">
        <Panel
          title={console.selectedNode ? 'Node inspector' : 'Trust kernel'}
          className="min-h-80 xl:flex-1"
          aside={
            console.selectedNode ? (
              <button
                onClick={() => console.setSelectedNode(null)}
                className="text-muted-foreground text-[10px] hover:text-white"
              >
                close
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <select
                  value={console.action}
                  onChange={(event) => {
                    const next = ACTIONS.find((a) => a.type === event.target.value);
                    console.setAction(event.target.value);
                    if (next) console.setCost(next.cost);
                  }}
                  className="border-border bg-card rounded border px-1 py-0.5 text-[10px]"
                >
                  {ACTIONS.map((action) => (
                    <option key={action.type} value={action.type}>
                      {action.label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={console.cost}
                  onChange={(event) => console.setCost(Number(event.target.value))}
                  className="border-border bg-card w-14 rounded border px-1 py-0.5 text-[10px]"
                />
              </div>
            )
          }
        >
          {console.selectedNode ? (
            <NodeInspector node={console.selectedNode} />
          ) : console.trust ? (
            <TrustPanel trust={console.trust} />
          ) : (
            <Hint>Fire an event so the Trust Kernel has context to rule on.</Hint>
          )}
        </Panel>

        <Panel title="Audit ledger" className="min-h-52 xl:max-h-[38%]">
          {console.detail && console.detail.audit.length > 0 ? (
            <AuditTimeline audit={console.detail.audit} />
          ) : (
            <Hint>Every stage writes here once an event lands.</Hint>
          )}
        </Panel>
      </div>
    </div>
  );
}
