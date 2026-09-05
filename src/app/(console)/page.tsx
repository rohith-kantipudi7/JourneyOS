'use client';

import { ContentPanel } from '@/components/journey/content-panel';
import { ContextGraph } from '@/components/journey/context-graph';
import { useConsoleContext } from '@/components/journey/console-provider';
import { JourneyHeader } from '@/components/journey/journey-header';
import { Hint, Panel } from '@/components/journey/panel';
import { CustomerRail } from '@/components/journey/rails';

const OUTCOME_COPY: Record<string, { title: string; body: string; tone: string }> = {
  auto_approve: {
    title: 'Handled for you',
    body: 'This was within policy, so we arranged it automatically. Nothing is needed from you.',
    tone: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  },
  needs_customer_approval: {
    title: 'One thing to confirm',
    body: 'We found a replacement, but it needs your approval before we book it.',
    tone: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  },
  hard_deny: {
    title: 'A person is taking this over',
    body: 'We could not act automatically here, so this has been passed to a colleague.',
    tone: 'border-rose-500/40 bg-rose-500/10 text-rose-200',
  },
};

/** Traveler Dashboard — the customer's own view of their disrupted journey. */
export default function TravelerDashboard() {
  const console = useConsoleContext();
  const decision = console.decision;
  const outcome = decision ? OUTCOME_COPY[decision.trust.outcome] : null;
  const options = decision ? [decision.bestOption, ...decision.alternatives] : [];

  return (
    <div className="grid h-full grid-cols-1 gap-3 overflow-auto p-3 xl:grid-cols-12 xl:overflow-hidden">
      <CustomerRail className="xl:col-span-3" />

      <div className="flex min-h-0 flex-col gap-3 xl:col-span-5">
        <Panel title="Your journey" className="min-h-0 flex-1">
          {console.detail ? (
            <>
              <JourneyHeader detail={console.detail} />

              {outcome && (
                <div className={`rounded-lg border p-3 ${outcome.tone}`}>
                  <p className="text-sm font-semibold">{outcome.title}</p>
                  <p className="mt-1 text-xs opacity-90">{outcome.body}</p>
                </div>
              )}

              {decision ? (
                <div className="mt-3 space-y-2">
                  <h3 className="text-muted-foreground text-[10px] tracking-[0.15em] uppercase">
                    What we recommend
                  </h3>
                  {options.map((option) => (
                    <article
                      key={option.optionId}
                      className={`rounded-lg border p-3 ${
                        option.rank === 1 ? 'border-white/45 bg-white/5' : 'border-border'
                      }`}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-medium">{option.label}</span>
                        <span className="font-mono text-[11px]">
                          {option.currency} {option.estimatedCost}
                        </span>
                      </div>
                      <p className="text-muted-foreground mt-1 text-xs">{option.summary}</p>
                      <ul className="text-muted-foreground mt-1.5 space-y-0.5 text-[10px]">
                        {option.evidence.slice(0, 3).map((line) => (
                          <li key={line}>· {line}</li>
                        ))}
                      </ul>
                      <div className="mt-2 flex gap-2">
                        <button
                          disabled={
                            console.busy ||
                            console.executed !== null ||
                            decision.trust.outcome === 'hard_deny'
                          }
                          onClick={() => void console.executeOption(option.optionId)}
                          className="flex-1 rounded border border-emerald-500/40 bg-emerald-500/10 py-1.5 text-[11px] font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-35"
                        >
                          {console.executed
                            ? 'Confirmed'
                            : decision.trust.outcome === 'hard_deny'
                              ? 'Unavailable'
                              : 'Accept this'}
                        </button>
                        <button
                          disabled={console.busy}
                          className="border-border rounded border px-3 text-[11px] transition hover:border-white/40 disabled:opacity-35"
                        >
                          Not this one
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mt-3">
                  <Hint>
                    No recommendation yet.
                    <br />
                    Open <strong className="text-foreground">Journey Studio</strong> and run the planner.
                  </Hint>
                </div>
              )}
            </>
          ) : (
            <Hint>Select a customer to see their journey.</Hint>
          )}
        </Panel>
      </div>

      <div className="flex min-h-0 flex-col gap-3 xl:col-span-4">
        <Panel title="Context" className="min-h-64 xl:flex-1" bodyClassName="relative overflow-hidden p-0">
          {console.graph ? (
            <ContextGraph
              compact
              graph={console.graph}
              selectedNodeId={console.selectedNode?.id ?? null}
              onSelectNode={console.setSelectedNode}
            />
          ) : (
            <Hint>Fire an event to build the context graph.</Hint>
          )}
        </Panel>

        <Panel
          title="What we would send"
          className="min-h-56 xl:max-h-[46%]"
          aside={
            console.decision && !console.content ? (
              <button
                onClick={() => void console.loadContent()}
                className="text-muted-foreground text-[10px] hover:text-white"
              >
                compose
              </button>
            ) : null
          }
        >
          {console.content ? (
            <ContentPanel content={console.content} />
          ) : console.contentLoading ? (
            <Hint>Composing…</Hint>
          ) : (
            <Hint>Customer-facing copy appears here once a decision exists.</Hint>
          )}
        </Panel>
      </div>
    </div>
  );
}
