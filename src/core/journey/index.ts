/**
 * Journey orchestration & Context Graph.
 *
 * Owns the Context Builder, which assembles an immutable, provenance-tagged
 * graph snapshot of typed nodes (Customer, Journey, Event, Preference, Consent,
 * PriorIncidentSummary) and typed edges (TRIGGERS, AFFECTS, DERIVED_FROM, …).
 *
 * Supports multi-hop traversal across a customer's prior journeys so history
 * measurably influences risk scoring and option ranking.
 */
export * from './context-builder';
export * from './freshness';
export * from './nodes';
export * from './prior-incidents';
export * from './snapshot.schema';
export * from './traverse';
