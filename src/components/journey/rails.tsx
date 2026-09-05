'use client';

import { useConsoleContext } from './console-provider';
import { Panel, PRIORITY_LABEL, TIER_TONE } from './panel';

/** Customer picker, shared by every screen so selection never diverges. */
export function CustomerRail({ className = '' }: { className?: string }) {
  const console = useConsoleContext();

  return (
    <Panel
      title="Customer"
      className={className}
      aside={
        <span className="text-muted-foreground text-[9px]">
          {console.customers.filter((c) => c.eventCount > 0).length}/{console.customers.length} live
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
                console.setSelectedNode(null);
              }}
              className={`w-full rounded-md border p-2 text-left transition ${
                selected ? 'border-white/60 bg-white/5' : 'border-border hover:border-white/30'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  {customer.eventCount > 0 && (
                    <span className="size-1.5 shrink-0 rounded-full bg-rose-400" aria-hidden />
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
  );
}

/** Event simulator, shared so any screen can drive the loop. */
export function SimulatorRail({ className = '' }: { className?: string }) {
  const console = useConsoleContext();

  return (
    <Panel title="Fire an event" className={className}>
      <p className="text-muted-foreground mb-2 text-[10px] leading-snug">
        Simulates a business event from an upstream system. It goes through the same validation,
        deduplication, and journey-attachment path as real traffic.
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
            <p className="text-muted-foreground mt-0.5 text-[10px] leading-snug">{scenario.description}</p>
          </button>
        ))}
      </div>
    </Panel>
  );
}
