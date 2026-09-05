'use client';

import { useState } from 'react';

import { AuditTimeline } from '@/components/journey/audit-timeline';
import { ContentPanel } from '@/components/journey/content-panel';
import { ContextGraph } from '@/components/journey/context-graph';
import { DecisionPanel } from '@/components/journey/decision-panel';
import { JourneyHeader } from '@/components/journey/journey-header';
import { NodeInspector } from '@/components/journey/node-inspector';
import { TrustPanel } from '@/components/journey/trust-panel';
import { useConsole } from '@/hooks/use-console';
import type { ContextNode } from '@/types';

const ACTIONS = [
  { type: 'issueVoucher', label: 'Issue voucher', cost: 120 },
  { type: 'rebookFlight', label: 'Rebook flight', cost: 240 },
  { type: 'reserveHotel', label: 'Reserve hotel', cost: 180 },
  { type: 'sendNotification', label: 'Send notification', cost: 0 },
] as const;

/** Tier ladder, lowest to highest — colour reinforces the policy hierarchy. */
const TIER_TONE: Record<string, string> = {
  standard: 'border-zinc-500/40 text-zinc-400',
  bronze: 'border-amber-700/50 text-amber-600',
  silver: 'border-zinc-300/40 text-zinc-300',
  gold: 'border-yellow-500/50 text-yellow-400',
  platinum: 'border-cyan-300/50 text-cyan-200',
};

const PRIORITY_LABEL: Record<string, string> = {
  fastest: 'fastest',
  cheapest: 'cheapest',
  most_comfortable: 'comfort',
  most_sustainable: 'green',
};

function Panel({
  step,
  title,
  aside,
  children,
  className = '',
  active = false,
}: {
  step?: number;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  active?: boolean;
}) {
  return (
    <section
      className={`bg-card flex min-h-0 flex-col rounded-xl border ${
        active ? 'border-white/40' : 'border-border'
      } ${className}`}
    >
      <header className="border-border flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="flex items-center gap-1.5 text-[10px] font-medium tracking-[0.15em] uppercase">
          {step !== undefined && (
            <span
              className={`flex size-4 items-center justify-center rounded-full text-[9px] ${
                active ? 'bg-white text-black' : 'bg-muted text-muted-foreground'
              }`}
            >
              {step}
            </span>
          )}
          {title}
        </h2>
        {aside}
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
    </section>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground flex h-full min-h-24 items-center justify-center px-6 text-center text-xs leading-relaxed">
      <p>{children}</p>
    </div>
  );
}

export function ConsoleView() {
  const console = useConsole();
  const [selectedNode, setSelectedNode] = useState<ContextNode | null>(null);
  const [tab, setTab] = useState<'trust' | 'decision' | 'content'>('trust');

  // Drives which step is highlighted, so the operator always knows what is next.
  const step = console.executed ? 4 : console.decision ? 3 : console.graph ? 2 : 1;

  return (
    <div className="flex h-screen flex-col gap-3 p-3">
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1">
        <h1 className="text-lg font-semibold tracking-tight">JourneyOS</h1>
        <p className="text-muted-foreground text-xs">
          Event → Context → Trust → Plan → Approve → Execute → Audit
        </p>
        {console.error && <p className="text-xs text-rose-400">{console.error}</p>}

        <div className="ml-auto flex items-center gap-3">
          {console.graph && (
            <p className="text-muted-foreground font-mono text-[10px]">
              {console.graph.stats.nodeCount} nodes · {console.graph.stats.edgeCount} edges · depth{' '}
              {console.graph.stats.maxDepthFromJourney}
              {console.graph.stale && <span className="ml-2 text-amber-400">stale inputs</span>}
            </p>
          )}
          <button
            disabled={console.busy}
            onClick={() => void console.resetDemo()}
            className="border-border rounded border px-2 py-0.5 text-[10px] transition hover:border-white/40 disabled:opacity-40"
          >
            Reset demo
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto xl:grid-cols-12 xl:overflow-hidden">
        {/* Control column */}
        <div className="flex min-h-0 flex-col gap-3 xl:col-span-3">
          <Panel
            title="Customer"
            className="max-h-[42%]"
            aside={
              <span className="text-muted-foreground text-[9px]">
                {console.customers.filter((c) => c.eventCount > 0).length} live / {console.customers.length}
              </span>
            }
          >
            <div className="space-y-1.5">
              {console.customers.map((customer) => {
                const selected = customer.id === console.customerId;
                return (
                  <button
                    key={customer.id}
                    onClick={() => {
                      console.selectCustomer(customer.id);
                      setSelectedNode(null);
                      setTab('trust');
                    }}
                    className={`w-full rounded-md border p-2 text-left transition ${
                      selected ? 'border-white/60 bg-white/5' : 'border-border hover:border-white/30'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {customer.eventCount > 0 && (
                          <span
                            className="size-1.5 shrink-0 rounded-full bg-rose-400"
                            title={`Live ${customer.latestEvent?.type ?? 'disruption'}`}
                            aria-hidden
                          />
                        )}
                        <span className="truncate text-xs font-medium">{customer.name}</span>
                      </span>
                      <span
                        className={`shrink-0 rounded border px-1 text-[8px] tracking-wide uppercase ${
                          TIER_TONE[customer.loyaltyTier] ?? 'border-border text-muted-foreground'
                        }`}
                      >
                        {customer.loyaltyTier}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-[10px]">
                      {customer.latestEvent ? (
                        <span className="text-rose-300">{customer.latestEvent.type}</span>
                      ) : (
                        <>{PRIORITY_LABEL[customer.preferences?.priority ?? ''] ?? 'fastest'}</>
                      )}{' '}
                      · {customer.journeyCount} journeys
                      {customer.decisionCount > 0 && <span className="text-amber-300"> · planned</span>}
                      {customer.actionCount > 0 && <span className="text-emerald-400"> · executed</span>}
                    </p>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel step={1} title="Fire an event" active={step === 1} className="xl:flex-1">
            <p className="text-muted-foreground mb-2 text-[10px] leading-snug">
              Simulates a business event arriving from an upstream system. It goes through the same
              validation, deduplication, and journey-attachment path as real traffic.
            </p>
            <div className="space-y-1.5">
              {console.scenarios.map((scenario) => (
                <button
                  key={scenario.id}
                  disabled={console.busy || !console.customerId}
                  onClick={() => void console.fireScenario(scenario.id)}
                  className="border-border w-full rounded-md border p-2 text-left transition hover:border-white/30 disabled:opacity-40"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-medium">{scenario.label}</span>
                    <span className="text-muted-foreground shrink-0 text-[9px] uppercase">
                      {scenario.expectedSeverity}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-[10px] leading-snug">
                    {scenario.description}
                  </p>
                </button>
              ))}
            </div>
          </Panel>
        </div>

        {/* Graph */}
        <Panel
          step={2}
          title="Context graph"
          active={step === 2}
          className="min-h-[460px] xl:col-span-6"
          aside={
            <div className="flex items-center gap-2">
              <button
                disabled={console.busy || !console.graph}
                onClick={() => {
                  setTab('decision');
                  setSelectedNode(null);
                  void console.planDecision();
                }}
                className="rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-35"
              >
                {console.busy ? 'Planning…' : 'Run planner'}
              </button>
            </div>
          }
        >
          {console.detail && <JourneyHeader detail={console.detail} />}
          {console.graph ? (
            <div className="h-[calc(100%-6.5rem)] min-h-72">
              <ContextGraph
                graph={console.graph}
                selectedNodeId={selectedNode?.id ?? null}
                onSelectNode={setSelectedNode}
              />
            </div>
          ) : (
            <Hint>
              This journey has no events yet, so there is nothing to reason about.
              <br />
              <strong className="text-foreground">Fire an event on the left</strong> to build the context
              graph — customer, preferences, consent, and prior incidents.
            </Hint>
          )}
        </Panel>

        {/* Inspector column */}
        <div className="flex min-h-0 flex-col gap-3 xl:col-span-3">
          <Panel
            step={3}
            active={step >= 3}
            title={
              selectedNode
                ? 'Node inspector'
                : tab === 'decision'
                  ? 'Decision'
                  : tab === 'content'
                    ? 'Experience'
                    : 'Trust kernel'
            }
            className="min-h-[380px] xl:flex-1"
            aside={
              selectedNode ? (
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-muted-foreground text-[10px] hover:text-white"
                >
                  close
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  {(['trust', 'decision', 'content'] as const).map((name) => (
                    <button
                      key={name}
                      onClick={() => {
                        setTab(name);
                        if (name === 'content') void console.loadContent();
                      }}
                      className={`rounded px-1.5 py-0.5 text-[10px] capitalize ${
                        tab === name ? 'bg-white/10 text-white' : 'text-muted-foreground'
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                  {tab === 'trust' && (
                    <>
                      <select
                        value={console.action}
                        onChange={(event) => {
                          const next = ACTIONS.find((a) => a.type === event.target.value);
                          console.setAction(event.target.value);
                          if (next) console.setCost(next.cost);
                        }}
                        className="border-border bg-card ml-1 rounded border px-1 py-0.5 text-[10px]"
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
                    </>
                  )}
                </div>
              )
            }
          >
            {selectedNode ? (
              <NodeInspector node={selectedNode} />
            ) : tab === 'content' ? (
              console.content ? (
                <ContentPanel content={console.content} />
              ) : console.contentLoading ? (
                <Hint>Composing customer-facing content…</Hint>
              ) : console.decision ? (
                <Hint>
                  Content is generated on demand from this decision.
                  <br />
                  <button
                    onClick={() => void console.loadContent()}
                    className="text-foreground mt-2 underline underline-offset-2"
                  >
                    Compose now
                  </button>
                </Hint>
              ) : (
                <Hint>
                  Customer-facing copy is generated from a decision.
                  <br />
                  Fire an event, then <strong className="text-foreground">Run planner</strong>.
                </Hint>
              )
            ) : tab === 'decision' ? (
              console.decision ? (
                <DecisionPanel
                  decision={console.decision}
                  busy={console.busy}
                  executed={console.executed !== null}
                  onExecute={(optionId) => void console.executeOption(optionId)}
                />
              ) : (
                <Hint>
                  No proposal yet.
                  <br />
                  Press <strong className="text-foreground">Run planner</strong> above to search
                  alternatives, screen them against policy, and rank them.
                </Hint>
              )
            ) : console.trust ? (
              <TrustPanel trust={console.trust} />
            ) : (
              <Hint>
                The Trust Kernel needs context before it can rule on anything.
                <br />
                <strong className="text-foreground">Fire an event on the left</strong> first.
              </Hint>
            )}
          </Panel>

          <Panel step={4} active={step === 4} title="Audit ledger" className="min-h-[200px] xl:max-h-[36%]">
            {console.detail && console.detail.audit.length > 0 ? (
              <AuditTimeline audit={console.detail.audit} />
            ) : (
              <Hint>Every stage of the loop writes here once an event lands.</Hint>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
