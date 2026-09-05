import type { CustomerId, EventId, JourneyId, JsonObject, SnapshotId } from '@/core/shared';

/**
 * Context Graph types.
 *
 * A snapshot is an immutable, provenance-tagged graph of everything that fed a
 * decision. Phase 3 implements the builder and traversal; the types live here
 * because decisions reference a snapshot id and the table must store the shape.
 */

export const CONTEXT_NODE_TYPES = [
  'Customer',
  'Journey',
  'Event',
  'Preference',
  'Consent',
  'Decision',
  'PriorIncidentSummary',
] as const;
export type ContextNodeType = (typeof CONTEXT_NODE_TYPES)[number];

export const CONTEXT_EDGE_TYPES = [
  'TRIGGERS',
  'AFFECTS',
  'BELONGS_TO',
  'EVALUATED_BY',
  'CONSTRAINS',
  'DERIVED_FROM',
] as const;
export type ContextEdgeType = (typeof CONTEXT_EDGE_TYPES)[number];

/** Where a piece of context came from and how much it should be trusted. */
export interface Provenance {
  readonly sourceSystem: string;
  readonly retrievedAt: Date;
  /** True when the data is older than its allowed age — feeds the freshness check. */
  readonly stale: boolean;
  readonly ageSeconds: number;
}

export interface ContextNode {
  readonly id: string;
  readonly type: ContextNodeType;
  readonly label: string;
  readonly data: JsonObject;
  readonly provenance: Provenance;
}

export interface ContextEdge {
  readonly id: string;
  readonly type: ContextEdgeType;
  readonly from: string;
  readonly to: string;
  readonly label: string;
}

export interface ContextSnapshot {
  readonly id: SnapshotId;
  readonly journeyId: JourneyId;
  readonly customerId: CustomerId;
  /** The event that prompted this snapshot. */
  readonly eventId: EventId;
  readonly nodes: readonly ContextNode[];
  readonly edges: readonly ContextEdge[];
  /** True if any contributing node is stale. */
  readonly stale: boolean;
  readonly builtAt: Date;
}

export type NewContextSnapshot = Omit<ContextSnapshot, 'builtAt'> & { readonly builtAt?: Date };

/**
 * Cross-journey pattern derived by traversing a customer's *prior* journeys.
 *
 * "Third disruption this quarter, and we already issued a voucher 18 days ago"
 * changes both the risk assessment and the appropriate remedy — and neither
 * fact is visible in the current event.
 */
export interface PriorIncidentSummary extends JsonObject {
  readonly totalPriorJourneys: number;
  readonly disruptedJourneys: number;
  readonly disruptionsLast90Days: number;
  readonly disruptionEventsLast90Days: number;
  readonly compensationEventsLast90Days: number;
  readonly compensationTotalEurLast90Days: number;
  readonly compensationWithin30Days: boolean;
  readonly daysSinceLastIncident: number | null;
  /** Share of prior journeys that were disrupted, 0–1. */
  readonly repeatDisruptionRate: number;
}
