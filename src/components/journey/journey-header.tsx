'use client';

import type { JourneyDetail } from '@/types/api';

const STATUS_STYLE: Record<string, string> = {
  active: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  disrupted: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
  recovering: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  completed: 'border-border bg-muted text-muted-foreground',
};

function formatTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Compact factual strip: what this journey is, and how far off the rails it is. */
export function JourneyHeader({ detail }: { detail: JourneyDetail }) {
  const { journey, customer } = detail;
  const context = journey.context;

  const origin = typeof context.origin === 'string' ? context.origin : null;
  const destination = typeof context.destination === 'string' ? context.destination : null;
  const flightNumber = typeof context.flightNumber === 'string' ? context.flightNumber : null;
  const deadline = formatTime(context.arriveBy);
  const distance = typeof context.distanceKm === 'number' ? context.distanceKm : null;

  const facts: Array<{ label: string; value: string }> = [];
  if (flightNumber) facts.push({ label: 'Flight', value: flightNumber });
  if (distance) facts.push({ label: 'Distance', value: `${distance.toLocaleString()} km` });
  if (typeof context.cabin === 'string') facts.push({ label: 'Cabin', value: context.cabin.replace('_', ' ') });
  if (typeof context.passengerCount === 'number')
    facts.push({ label: 'Pax', value: String(context.passengerCount) });
  if (deadline) facts.push({ label: 'Must arrive by', value: deadline });
  if (typeof context.orderId === 'string') facts.push({ label: 'Order', value: context.orderId });

  return (
    <div className="border-border bg-card mb-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {origin && destination ? (
          <span className="text-base font-semibold tracking-tight">
            {origin} <span className="text-muted-foreground">→</span> {destination}
          </span>
        ) : (
          <span className="text-sm font-semibold">{journey.template.replace(/[._]/g, ' ')}</span>
        )}

        <span
          className={`rounded border px-1.5 py-0.5 text-[9px] tracking-wide uppercase ${
            STATUS_STYLE[journey.status] ?? 'border-border text-muted-foreground'
          }`}
        >
          {journey.status}
        </span>

        {customer && (
          <span className="text-muted-foreground text-xs">
            {customer.name} · {customer.loyaltyTier}
          </span>
        )}

        <span className="text-muted-foreground ml-auto font-mono text-[10px]">
          {detail.events.length} events · {detail.audit.length} audit records
        </span>
      </div>

      <p className="text-muted-foreground mt-1.5 text-xs italic">“{journey.goal}”</p>

      {facts.length > 0 && (
        <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {facts.map((fact) => (
            <div key={fact.label} className="flex items-baseline gap-1">
              <dt className="text-muted-foreground text-[9px] tracking-wide uppercase">{fact.label}</dt>
              <dd className="text-[11px] font-medium">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
