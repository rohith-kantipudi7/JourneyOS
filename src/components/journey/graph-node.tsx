'use client';

import type { ContextNode } from '@/types';

/**
 * Graph node card.
 *
 * Each type renders the one or two facts that actually influenced the
 * decision, so the graph explains itself without needing the inspector open.
 */

export const NODE_WIDTH = 212;
export const NODE_HEIGHT = 66;

const TYPE_STYLE: Record<string, { accent: string; glyph: string; label: string }> = {
  Customer: { accent: '#7c9cff', glyph: '◉', label: 'Customer' },
  Preference: { accent: '#a78bfa', glyph: '⚙', label: 'Preference' },
  Consent: { accent: '#e879c7', glyph: '✓', label: 'Consent' },
  Event: { accent: '#60a5fa', glyph: '⚡', label: 'Event' },
  Journey: { accent: '#f0a94f', glyph: '✈', label: 'Journey' },
  PriorIncidentSummary: { accent: '#f4626e', glyph: '⟲', label: 'History' },
  Decision: { accent: '#34d399', glyph: '◆', label: 'Decision' },
};

export const TYPE_ACCENT: Record<string, string> = Object.fromEntries(
  Object.entries(TYPE_STYLE).map(([type, style]) => [type, style.accent]),
);

const SEVERITY_TONE: Record<string, string> = {
  critical: '#f4626e',
  high: '#f4626e',
  medium: '#f0a94f',
  low: '#9ca3af',
  info: '#9ca3af',
};

function relativeTime(iso: unknown): string {
  if (typeof iso !== 'string') return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';

  const minutes = Math.round(ms / 60_000);
  if (Math.abs(minutes) < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** The headline fact for this node type, and an optional supporting detail. */
function summarize(node: ContextNode): { headline: string; detail?: string; tone?: string } {
  const data = node.data;

  switch (node.type) {
    case 'Customer':
      return {
        headline: String(data.loyaltyTier ?? '').toUpperCase(),
        detail: `${Number(data.loyaltyPoints ?? 0).toLocaleString()} pts`,
      };

    case 'Preference':
      return {
        headline: String(data.priority ?? '').replace('_', ' '),
        detail: `${String(data.preferredCabin ?? '').replace('_', ' ')} · ≤${String(data.maxLayovers ?? 0)} stop`,
      };

    case 'Consent': {
      const granted = data.granted === true;
      return {
        headline: `${String(data.channel ?? '')} · ${String(data.purpose ?? '').replace(/_/g, ' ')}`,
        detail: granted ? 'granted' : 'withheld',
        tone: granted ? '#34d399' : '#f4626e',
      };
    }

    case 'Event': {
      const severity = String(data.severity ?? 'medium');
      return {
        headline: String(data.type ?? ''),
        detail: `${severity} · ${relativeTime(data.occurredAt)}`,
        tone: SEVERITY_TONE[severity],
      };
    }

    case 'Journey': {
      const context = (data.context ?? {}) as Record<string, unknown>;
      const route =
        context.origin && context.destination
          ? `${String(context.origin)} → ${String(context.destination)}`
          : String(data.template ?? '');
      return { headline: route, detail: String(data.status ?? '') };
    }

    case 'PriorIncidentSummary':
      return {
        headline: `${String(data.disruptionsLast90Days ?? 0)} disruptions / 90d`,
        detail: `risk +${String(data.riskContribution ?? 0)}${
          data.compensationWithin30Days === true ? ' · recent payout' : ''
        }`,
        tone: Number(data.riskContribution ?? 0) > 40 ? '#f4626e' : undefined,
      };

    default:
      return { headline: node.label };
  }
}

interface GraphNodeProps {
  node: ContextNode;
  primary: boolean;
  selected: boolean;
  x: number;
  y: number;
  onSelect: (node: ContextNode) => void;
}

export function GraphNode({ node, primary, selected, x, y, onSelect }: GraphNodeProps) {
  const style = TYPE_STYLE[node.type] ?? { accent: '#8b8b8b', glyph: '•', label: node.type };
  const { headline, detail, tone } = summarize(node);
  const stale = node.provenance.stale;

  return (
    <button
      type="button"
      onClick={() => onSelect(node)}
      className="absolute flex flex-col justify-center rounded-lg border px-2.5 text-left transition hover:brightness-125"
      style={{
        left: x,
        top: y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        background: primary ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.04)',
        borderColor: selected ? '#ffffff' : primary ? style.accent : 'rgba(255,255,255,0.15)',
        borderWidth: primary || selected ? 1.5 : 1,
        boxShadow: selected ? '0 0 0 3px rgba(255,255,255,0.2)' : undefined,
      }}
    >
      <span className="flex items-center gap-1.5">
        <span style={{ color: style.accent, fontSize: 11, lineHeight: 1 }}>{style.glyph}</span>
        <span
          className="text-[9px] font-semibold tracking-[0.12em] uppercase"
          style={{ color: style.accent }}
        >
          {style.label}
        </span>
        {primary && (
          <span className="ml-auto rounded bg-white/15 px-1 text-[8px] tracking-wide text-white uppercase">
            current
          </span>
        )}
        {stale && !primary && (
          <span className="ml-auto text-[8px] tracking-wide text-amber-400 uppercase">stale</span>
        )}
      </span>

      <span className="mt-1 truncate text-[12px] leading-tight font-medium text-white/90" title={headline}>
        {headline}
      </span>

      {detail && (
        <span
          className="mt-0.5 truncate text-[10px] leading-tight"
          style={{ color: tone ?? 'rgba(255,255,255,0.45)' }}
        >
          {detail}
        </span>
      )}
    </button>
  );
}
