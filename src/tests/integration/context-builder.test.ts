import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  JourneyContextBuilder,
  contextSnapshotSchema,
  isConnectedFrom,
  maxDepthFrom,
  preferenceNodeId,
  priorIncidentNodeId,
  traverse,
} from '@/core/journey';
import { EventIds, JourneyIds, fixedClock } from '@/core/shared';
import type { DatabaseConnection } from '@/db/client';
import { createRepositories } from '@/db/repositories';
import { buildSeedDataset } from '@/db/seed';
import { EventGateway, SCENARIOS } from '@/events';
import type { ContextSnapshot, Repositories } from '@/types';

import { createTestDatabase } from '../fixtures/database';

const NOW = new Date('2026-03-01T12:00:00.000Z');

describe('JourneyContextBuilder', () => {
  let connection: DatabaseConnection;
  let repos: Repositories;
  let gateway: EventGateway;
  let builder: JourneyContextBuilder;
  let dataset: ReturnType<typeof buildSeedDataset>;

  beforeEach(async () => {
    connection = await createTestDatabase();
    const clock = fixedClock(NOW);
    repos = createRepositories(connection.db, clock);
    gateway = new EventGateway({ repositories: repos, clock });
    builder = new JourneyContextBuilder({ repositories: repos, clock });
    dataset = buildSeedDataset(NOW);

    for (const customer of dataset.customers) await repos.customers.create(customer);
    for (const journey of dataset.journeys) await repos.journeys.create(journey);
    for (const consent of dataset.consents) await repos.consents.upsert(consent);
    for (const event of dataset.events) await repos.events.create(event);
  });

  afterEach(() => connection.close());

  const Priya = () => dataset.customers[0]!;
  const anika = () => dataset.customers[1]!;

  /** Ingests the flagship cancellation and returns the resulting snapshot. */
  async function snapshotFor(customerId: (typeof dataset.customers)[number]['id']): Promise<ContextSnapshot> {
    const ingested = await gateway.ingest(SCENARIOS.flight_cancelled.build({ customerId, now: NOW }));
    if (!ingested.ok) throw new Error(`ingest failed: ${ingested.error.code}`);

    const built = await builder.build({
      journeyId: ingested.value.journey.id,
      eventId: ingested.value.event.id,
    });
    if (!built.ok) throw new Error(`build failed: ${built.error.code}`);

    return built.value;
  }

  describe('validation and failure modes', () => {
    it('rejects an unknown journey', async () => {
      const result = await builder.build({ journeyId: JourneyIds.generate(), eventId: EventIds.generate() });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('journey_not_found');
    });

    it('rejects an event that belongs to a different journey', async () => {
      const ingested = await gateway.ingest(
        SCENARIOS.flight_cancelled.build({ customerId: Priya().id, now: NOW }),
      );
      if (!ingested.ok) throw new Error('ingest failed');

      const otherJourney = dataset.journeys.find((j) => j.id !== ingested.value.journey.id)!;
      const result = await builder.build({
        journeyId: otherJourney.id,
        eventId: ingested.value.event.id,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('event_journey_mismatch');
    });
  });

  describe('snapshot shape', () => {
    it('validates against the snapshot schema', async () => {
      const snapshot = await snapshotFor(Priya().id);
      expect(contextSnapshotSchema.safeParse(snapshot).success).toBe(true);
    });

    it('includes every required node type', async () => {
      const snapshot = await snapshotFor(Priya().id);
      const types = new Set(snapshot.nodes.map((node) => node.type));

      expect(types).toContain('Customer');
      expect(types).toContain('Journey');
      expect(types).toContain('Event');
      expect(types).toContain('Preference');
      expect(types).toContain('Consent');
      expect(types).toContain('PriorIncidentSummary');
    });

    it('tags every node with provenance', async () => {
      const snapshot = await snapshotFor(Priya().id);

      for (const node of snapshot.nodes) {
        expect(node.provenance.sourceSystem).toBeTruthy();
        expect(node.provenance.ageSeconds).toBeGreaterThanOrEqual(0);
        expect(typeof node.provenance.stale).toBe('boolean');
      }
    });

    it('flags staleness precisely, without blaming archival history', async () => {
      const snapshot = await snapshotFor(Priya().id);

      // Historical nodes are archival: decades old and still not "stale".
      const archival = snapshot.nodes.filter((node) => node.provenance.sourceSystem === 'archive');
      expect(archival.length).toBeGreaterThan(0);
      expect(archival.every((node) => !node.provenance.stale)).toBe(true);

      // The trigger event and journey are current.
      const trigger = snapshot.nodes.find((node) => node.id === snapshot.eventId);
      expect(trigger?.provenance.stale).toBe(false);

      // The only stale input is consent captured 540 days ago — a real signal
      // that the grant may need re-confirmation, surfaced rather than hidden.
      const stale = snapshot.nodes.filter((node) => node.provenance.stale);
      expect(stale.length).toBeGreaterThan(0);
      expect(stale.every((node) => node.type === 'Consent')).toBe(true);
      expect(snapshot.stale).toBe(true);
    });

    it('reports a fresh snapshot when no input has aged out', async () => {
      const anikaSnapshot = await snapshotFor(anika().id);

      // Anika's consent was captured 120 days ago, inside every budget.
      expect(anikaSnapshot.nodes.some((node) => node.provenance.stale)).toBe(false);
      expect(anikaSnapshot.stale).toBe(false);
    });

    it('has no dangling edges', async () => {
      const snapshot = await snapshotFor(Priya().id);
      const ids = new Set(snapshot.nodes.map((node) => node.id));

      for (const edge of snapshot.edges) {
        expect(ids.has(edge.from), `edge ${edge.id} from`).toBe(true);
        expect(ids.has(edge.to), `edge ${edge.id} to`).toBe(true);
      }
    });

    it('produces a graph fully connected from the journey node', async () => {
      const snapshot = await snapshotFor(Priya().id);
      expect(isConnectedFrom(snapshot, snapshot.journeyId)).toBe(true);
    });
  });

  describe('multi-hop history', () => {
    it('reaches prior journeys and their events through the summary node', async () => {
      const snapshot = await snapshotFor(Priya().id);

      // journey -> summary -> prior journey -> prior event is at least 3 hops.
      expect(maxDepthFrom(snapshot, snapshot.journeyId)).toBeGreaterThanOrEqual(3);

      const oneHop = traverse(snapshot, snapshot.journeyId, 1);
      const threeHops = traverse(snapshot, snapshot.journeyId, 3);
      expect(threeHops.nodes.length).toBeGreaterThan(oneHop.nodes.length);
    });

    it('connects the summary node to each prior journey', async () => {
      const snapshot = await snapshotFor(Priya().id);
      const summaryId = priorIncidentNodeId(Priya().id);

      const derived = snapshot.edges.filter(
        (edge) => edge.from === summaryId && edge.type === 'DERIVED_FROM',
      );

      expect(derived.length).toBe(3);
    });

    it('links preferences and consent as constraints on the journey', async () => {
      const snapshot = await snapshotFor(Priya().id);

      const constrains = snapshot.edges.filter((edge) => edge.type === 'CONSTRAINS');
      const fromPreferences = constrains.some((edge) => edge.from === preferenceNodeId(Priya().id));

      expect(fromPreferences).toBe(true);
      // Six seeded consent records, all governing the journey.
      expect(constrains.filter((edge) => edge.from.startsWith('csn_'))).toHaveLength(6);
    });
  });

  describe('history measurably changes risk', () => {
    it('scores a customer with prior incidents higher than one with a clean record', async () => {
      const troubled = await snapshotFor(Priya().id);
      const clean = await snapshotFor(anika().id);

      const riskOf = (snapshot: ContextSnapshot): number => {
        const node = snapshot.nodes.find((candidate) => candidate.type === 'PriorIncidentSummary');
        return Number(node?.data.riskContribution ?? 0);
      };

      expect(riskOf(troubled)).toBeGreaterThan(riskOf(clean));
      expect(riskOf(clean)).toBe(0);
    });

    it('surfaces the recent voucher that must constrain further compensation', async () => {
      const snapshot = await snapshotFor(Priya().id);
      const summary = snapshot.nodes.find((node) => node.type === 'PriorIncidentSummary');

      expect(summary?.data.compensationWithin30Days).toBe(true);
      expect(summary?.data.compensationTotalEurLast90Days).toBe(120);
      expect(summary?.data.disruptedJourneys).toBe(2);
    });
  });

  describe('persistence', () => {
    it('stores the snapshot immutably and opens the context audit stage', async () => {
      const ingested = await gateway.ingest(
        SCENARIOS.flight_cancelled.build({ customerId: Priya().id, now: NOW }),
      );
      if (!ingested.ok) throw new Error('ingest failed');

      const captured = await builder.capture({
        journeyId: ingested.value.journey.id,
        eventId: ingested.value.event.id,
      });

      expect(captured.ok).toBe(true);
      if (!captured.ok) return;

      const reloaded = await repos.snapshots.findById(captured.value.id);
      expect(reloaded?.nodes.length).toBe(captured.value.nodes.length);
      expect(reloaded?.edges.length).toBe(captured.value.edges.length);

      const trail = await repos.audit.listByStage(ingested.value.journey.id, 'context');
      expect(trail).toHaveLength(1);
      expect(trail[0]?.action).toBe('context.snapshot_built');
    });

    it('gives each capture a distinct snapshot id so decisions can pin one', async () => {
      const ingested = await gateway.ingest(
        SCENARIOS.flight_cancelled.build({ customerId: Priya().id, now: NOW }),
      );
      if (!ingested.ok) throw new Error('ingest failed');

      const input = { journeyId: ingested.value.journey.id, eventId: ingested.value.event.id };
      const first = await builder.capture(input);
      const second = await builder.capture(input);

      expect(first.ok && second.ok).toBe(true);
      if (!first.ok || !second.ok) return;
      expect(first.value.id).not.toBe(second.value.id);
    });
  });
});
