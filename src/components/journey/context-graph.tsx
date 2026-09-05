'use client';

import { useMemo, useState } from 'react';

import type { ContextNode } from '@/types';
import type { GraphResponse } from '@/types/api';

import { GraphNode, NODE_HEIGHT, NODE_WIDTH, TYPE_ACCENT } from './graph-node';

/**
 * Context graph, rendered directly as SVG + positioned cards.
 *
 * Laid out left-to-right as cause → effect, so the picture reads as an
 * argument: who the customer is, what constrains us, what happened, which
 * journey it hit, and what history says about it.
 */
const COLUMNS: ReadonlyArray<{ readonly title: string; readonly types: readonly string[] }> = [
  { title: 'Who', types: ['Customer', 'Preference'] },
  { title: 'Constraints', types: ['Consent'] },
  { title: 'What happened', types: ['Event'] },
  { title: 'Journey', types: ['Journey'] },
  { title: 'History', types: ['PriorIncidentSummary'] },
  { title: 'Prior journeys', types: [] },
];

const COLUMN_GAP = 96;
const ROW_GAP = 26;
const PADDING = 28;
const COLUMN_STRIDE = NODE_WIDTH + COLUMN_GAP;
const ROW_STRIDE = NODE_HEIGHT + ROW_GAP;

const EDGE_TONE: Record<string, string> = {
  TRIGGERS: '#60a5fa',
  CONSTRAINS: '#e879c7',
  AFFECTS: '#f4626e',
  DERIVED_FROM: '#f4626e',
  BELONGS_TO: 'rgba(255,255,255,0.16)',
  EVALUATED_BY: '#34d399',
};

interface Placed {
  readonly node: ContextNode;
  readonly x: number;
  readonly y: number;
  readonly primary: boolean;
}

function useLayout(graph: GraphResponse) {
  return useMemo(() => {
    const columnOf = (node: ContextNode): number => {
      // Prior journeys and archived events sit right of the summary they derive from.
      const prior =
        (node.type === 'Journey' && node.id !== graph.journeyId) ||
        (node.type === 'Event' && node.provenance.sourceSystem === 'archive');
      if (prior) return COLUMNS.length - 1;

      const index = COLUMNS.findIndex((column) => column.types.includes(node.type));
      return index < 0 ? 0 : index;
    };

    const grouped = new Map<number, ContextNode[]>();
    for (const node of graph.nodes) {
      const column = columnOf(node);
      grouped.set(column, [...(grouped.get(column) ?? []), node]);
    }

    const tallest = Math.max(...[...grouped.values()].map((list) => list.length), 1);

    const placed: Placed[] = [];
    for (const [column, list] of grouped) {
      // Vertically centre each column against the tallest one.
      const offset = ((tallest - list.length) * ROW_STRIDE) / 2;
      list.forEach((node, row) => {
        placed.push({
          node,
          x: PADDING + column * COLUMN_STRIDE,
          y: PADDING + offset + row * ROW_STRIDE,
          primary: node.id === graph.journeyId || node.id === graph.eventId,
        });
      });
    }

    const byId = new Map(placed.map((entry) => [entry.node.id, entry]));

    return {
      placed,
      byId,
      width: PADDING * 2 + COLUMNS.length * COLUMN_STRIDE,
      height: PADDING * 2 + tallest * ROW_STRIDE,
      columnCount: grouped.size,
    };
  }, [graph]);
}

interface ContextGraphProps {
  graph: GraphResponse;
  selectedNodeId?: string | null;
  onSelectNode: (node: ContextNode | null) => void;
  /** Hide the legend and zoom controls where space is tight. */
  compact?: boolean;
}

export function ContextGraph({ graph, selectedNodeId, onSelectNode, compact = false }: ContextGraphProps) {
  const layout = useLayout(graph);
  const [zoom, setZoom] = useState(compact ? 0.62 : 0.85);

  return (
    <div className="absolute inset-0 overflow-auto">
      <div
        className="relative origin-top-left"
        style={{
          width: layout.width,
          height: layout.height,
          transform: `scale(${zoom})`,
          // Reserve the scaled footprint so scrolling reaches every node.
          marginBottom: layout.height * (zoom - 1),
          marginRight: layout.width * (zoom - 1),
        }}
      >
        <svg width={layout.width} height={layout.height} className="pointer-events-none absolute inset-0">
          <defs>
            {Object.entries(EDGE_TONE).map(([type, colour]) => (
              <marker
                key={type}
                id={`arrow-${type}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={colour} />
              </marker>
            ))}
          </defs>

          {graph.edges.map((edge) => {
            const from = layout.byId.get(edge.from);
            const to = layout.byId.get(edge.to);
            if (!from || !to) return null;

            const rightward = to.x >= from.x;
            const x1 = rightward ? from.x + NODE_WIDTH : from.x;
            const x2 = rightward ? to.x : to.x + NODE_WIDTH;
            const y1 = from.y + NODE_HEIGHT / 2;
            const y2 = to.y + NODE_HEIGHT / 2;
            const curve = Math.max(36, Math.abs(x2 - x1) * 0.45);

            const colour = EDGE_TONE[edge.type] ?? 'rgba(255,255,255,0.2)';
            const emphasised = edge.type === 'TRIGGERS' || edge.type === 'AFFECTS';

            return (
              <g key={edge.id}>
                <path
                  d={`M ${x1} ${y1} C ${x1 + (rightward ? curve : -curve)} ${y1}, ${
                    x2 - (rightward ? curve : -curve)
                  } ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={colour}
                  strokeWidth={emphasised ? 1.8 : 1.1}
                  strokeDasharray={edge.type === 'BELONGS_TO' ? '4 4' : undefined}
                  markerEnd={`url(#arrow-${edge.type})`}
                />
                <text
                  x={(x1 + x2) / 2}
                  y={(y1 + y2) / 2 - 5}
                  textAnchor="middle"
                  fontSize={8.5}
                  fill="rgba(255,255,255,0.45)"
                >
                  {edge.type.replace(/_/g, ' ').toLowerCase()}
                </text>
              </g>
            );
          })}
        </svg>

        {layout.placed.map((entry) => (
          <GraphNode
            key={entry.node.id}
            node={entry.node}
            primary={entry.primary}
            selected={entry.node.id === selectedNodeId}
            x={entry.x}
            y={entry.y}
            onSelect={onSelectNode}
          />
        ))}
      </div>

      {!compact && (
        <>
          <div className="border-border bg-card/90 pointer-events-none absolute top-2 left-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-2.5 py-1.5 backdrop-blur">
            {Object.entries(TYPE_ACCENT)
              .filter(([type]) => type !== 'Decision')
              .map(([type, colour]) => (
                <span key={type} className="flex items-center gap-1 text-[9px] text-white/60">
                  <span className="size-1.5 rounded-full" style={{ background: colour }} aria-hidden />
                  {type === 'PriorIncidentSummary' ? 'History' : type}
                </span>
              ))}
            <span className="ml-1 text-[9px] text-white/35">click a node to inspect its provenance</span>
          </div>

          <div className="border-border bg-card/90 absolute right-2 bottom-2 flex items-center gap-1 rounded-md border px-1.5 py-1 backdrop-blur">
            <button
              onClick={() => setZoom((current) => Math.max(0.35, current - 0.15))}
              className="text-muted-foreground px-1.5 text-sm leading-none hover:text-white"
              aria-label="Zoom out"
            >
              −
            </button>
            <span className="text-muted-foreground w-9 text-center font-mono text-[10px]">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((current) => Math.min(1.6, current + 0.15))}
              className="text-muted-foreground px-1.5 text-sm leading-none hover:text-white"
              aria-label="Zoom in"
            >
              +
            </button>
            <button
              onClick={() => setZoom(0.85)}
              className="text-muted-foreground ml-1 text-[10px] hover:text-white"
            >
              reset
            </button>
          </div>
        </>
      )}
    </div>
  );
}
