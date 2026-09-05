import { describe, expect, it } from 'vitest';

import {
  FRESHNESS_BUDGET_SECONDS,
  contextRiskContribution,
  isConnectedFrom,
  maxDepthFrom,
  neighbours,
  provenanceFor,
  summarizePriorIncidents,
  traverse,
  type Graph,
} from '@/core/journey';
import { EventIds, JourneyIds, correlationIdSchema, type CustomerId, type JourneyId } from '@/core/shared';
import type { ContextEdge, ContextNode, Journey, JourneyEvent } from '@/types';

const NOW = new Date('2026-03-01T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

describe('freshness & provenance', () => {
  it('marks data fresh inside its budget', () => {
    const observed = new Date(NOW.getTime() - 60 * 1000);
    const provenance = provenanceFor('travel_inventory', observed, NOW);

    expect(provenance.stale).toBe(false);
    expect(provenance.ageSeconds).toBe(60);
    expect(provenance.sourceSystem).toBe('travel_inventory');
  });

  it('marks data stale past its budget', () => {
    const observed = new Date(NOW.getTime() - (FRESHNESS_BUDGET_SECONDS.travel_inventory + 1) * 1000);
    expect(provenanceFor('travel_inventory', observed, NOW).stale).toBe(true);
  });

  it('applies a different budget per source system', () => {
    const observed = new Date(NOW.getTime() - 30 * 60 * 1000);

    // 30 minutes is stale for inventory but fine for CRM.
    expect(provenanceFor('travel_inventory', observed, NOW).stale).toBe(true);
    expect(provenanceFor('crm', observed, NOW).stale).toBe(false);
  });

  it('never marks archival records stale, because age is the point', () => {
    const ancient = new Date(NOW.getTime() - 5 * 365 * DAY);

    expect(provenanceFor('archive', ancient, NOW).stale).toBe(false);
    expect(provenanceFor('event_store', ancient, NOW).stale).toBe(true);
  });

  it('does not treat slow-changing profile or consent data as stale', () => {
    const monthOld = new Date(NOW.getTime() - 25 * DAY);

    expect(provenanceFor('crm', monthOld, NOW).stale).toBe(false);
    expect(provenanceFor('consent_store', monthOld, NOW).stale).toBe(false);
  });

  it('records retrieval time separately from data age', () => {
    const observed = new Date(NOW.getTime() - 10 * DAY);
    const provenance = provenanceFor('crm', observed, NOW);

    expect(provenance.retrievedAt).toEqual(NOW);
    expect(provenance.ageSeconds).toBe(10 * 24 * 60 * 60);
  });
});

describe('prior incident summary', () => {
  const customerId = 'cus_11111111111111111111111111111111' as CustomerId;

  const journey = (overrides: Partial<Journey> & { id: JourneyId }): Journey => ({
    customerId,
    template: 'travel.disruption_recovery',
    status: 'completed',
    goal: 'Prior journey',
    context: {},
    startedAt: NOW,
    completedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });

  const disruptionEvent = (journeyId: JourneyId, daysAgo: number): JourneyEvent => ({
    id: EventIds.generate(),
    type: 'FlightCancelled',
    customerId,
    journeyId,
    correlationId: correlationIdSchema.parse(`c-${daysAgo}-${Math.random()}`),
    severity: 'high',
    source: 'test',
    payload: {},
    occurredAt: new Date(NOW.getTime() - daysAgo * DAY),
    receivedAt: new Date(NOW.getTime() - daysAgo * DAY),
  });

  it('reports a clean record as zero risk', () => {
    const summary = summarizePriorIncidents([], [], NOW);

    expect(summary.totalPriorJourneys).toBe(0);
    expect(summary.disruptionsLast90Days).toBe(0);
    expect(summary.daysSinceLastIncident).toBeNull();
    expect(summary.repeatDisruptionRate).toBe(0);
    expect(contextRiskContribution(summary)).toBe(0);
  });

  it('counts disruptions only inside the 90-day window', () => {
    const recent = journey({
      id: JourneyIds.generate(),
      context: { disrupted: true },
      startedAt: new Date(NOW.getTime() - 20 * DAY),
    });
    const old = journey({
      id: JourneyIds.generate(),
      context: { disrupted: true },
      startedAt: new Date(NOW.getTime() - 200 * DAY),
    });

    const summary = summarizePriorIncidents([recent, old], [], NOW);

    expect(summary.disruptedJourneys).toBe(2);
    expect(summary.disruptionsLast90Days).toBe(1);
  });

  it('flags compensation issued within 30 days', () => {
    const withVoucher = journey({
      id: JourneyIds.generate(),
      context: {
        disrupted: true,
        compensationIssued: {
          type: 'voucher',
          amountEur: 120,
          issuedAt: new Date(NOW.getTime() - 18 * DAY).toISOString(),
        },
      },
      startedAt: new Date(NOW.getTime() - 20 * DAY),
    });

    const summary = summarizePriorIncidents([withVoucher], [], NOW);

    expect(summary.compensationWithin30Days).toBe(true);
    expect(summary.compensationTotalEurLast90Days).toBe(120);
  });

  it('ignores malformed compensation records rather than throwing', () => {
    const broken = journey({
      id: JourneyIds.generate(),
      context: { disrupted: true, compensationIssued: { type: 'voucher' } },
    });

    const summary = summarizePriorIncidents([broken], [], NOW);
    expect(summary.compensationEventsLast90Days).toBe(0);
  });

  it('derives days since the most recent incident', () => {
    const id = JourneyIds.generate();
    const prior = journey({ id, context: { disrupted: true }, startedAt: new Date(NOW.getTime() - 40 * DAY) });

    const summary = summarizePriorIncidents([prior], [disruptionEvent(id, 12)], NOW);
    expect(summary.daysSinceLastIncident).toBe(12);
  });

  it('produces a strictly higher risk contribution for a worse history', () => {
    const clean = summarizePriorIncidents([], [], NOW);

    const id = JourneyIds.generate();
    const troubled = summarizePriorIncidents(
      [
        journey({
          id,
          context: {
            disrupted: true,
            compensationIssued: {
              type: 'voucher',
              amountEur: 120,
              issuedAt: new Date(NOW.getTime() - 18 * DAY).toISOString(),
            },
          },
          startedAt: new Date(NOW.getTime() - 20 * DAY),
        }),
        journey({
          id: JourneyIds.generate(),
          context: { disrupted: true },
          startedAt: new Date(NOW.getTime() - 55 * DAY),
        }),
      ],
      [disruptionEvent(id, 18)],
      NOW,
    );

    expect(contextRiskContribution(troubled)).toBeGreaterThan(contextRiskContribution(clean));
    expect(contextRiskContribution(troubled)).toBeGreaterThanOrEqual(50);
  });

  it('caps the contribution at 100', () => {
    const journeys = Array.from({ length: 8 }, () =>
      journey({
        id: JourneyIds.generate(),
        context: {
          disrupted: true,
          compensationIssued: { type: 'voucher', amountEur: 300, issuedAt: NOW.toISOString() },
        },
        startedAt: new Date(NOW.getTime() - 5 * DAY),
      }),
    );

    expect(contextRiskContribution(summarizePriorIncidents(journeys, [], NOW))).toBeLessThanOrEqual(100);
  });
});

describe('graph traversal', () => {
  const node = (id: string): ContextNode => ({
    id,
    type: 'Journey',
    label: id,
    data: {},
    provenance: { sourceSystem: 'test', retrievedAt: NOW, stale: false, ageSeconds: 0 },
  });

  const link = (from: string, to: string): ContextEdge => ({
    id: `${from}->${to}`,
    type: 'AFFECTS',
    from,
    to,
    label: 'affects',
  });

  // a -> b -> c -> d, plus an isolated node.
  const graph: Graph = {
    nodes: ['a', 'b', 'c', 'd', 'island'].map(node),
    edges: [link('a', 'b'), link('b', 'c'), link('c', 'd')],
  };

  it('returns direct neighbours in both directions', () => {
    expect(neighbours(graph, 'b').sort()).toEqual(['a', 'c']);
    expect(neighbours(graph, 'b', 'outgoing')).toEqual(['c']);
    expect(neighbours(graph, 'b', 'incoming')).toEqual(['a']);
  });

  it('limits the subgraph to the requested hop count', () => {
    const oneHop = traverse(graph, 'a', 1);
    expect(oneHop.nodes.map((n) => n.id).sort()).toEqual(['a', 'b']);

    const twoHops = traverse(graph, 'a', 2);
    expect(twoHops.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('records the hop distance for every reached node', () => {
    expect(traverse(graph, 'a', 3).depthByNode).toEqual({ a: 0, b: 1, c: 2, d: 3 });
  });

  it('excludes edges that leave the subgraph', () => {
    const oneHop = traverse(graph, 'a', 1);
    expect(oneHop.edges.map((e) => e.id)).toEqual(['a->b']);
  });

  it('returns an empty result for an unknown start node', () => {
    expect(traverse(graph, 'missing', 3).nodes).toEqual([]);
  });

  it('measures the longest path and detects disconnection', () => {
    expect(maxDepthFrom(graph, 'a')).toBe(3);
    expect(isConnectedFrom(graph, 'a')).toBe(false);
  });
});
