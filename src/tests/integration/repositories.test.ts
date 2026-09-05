import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ActionIds, AuditRecordIds, ConsentIds, fixedClock, idempotencyKeyFrom } from '@/core/shared';
import type { DatabaseConnection } from '@/db/client';
import { RecordNotFoundError, createRepositories } from '@/db/repositories';
import { buildSeedDataset } from '@/db/seed';
import type { Repositories } from '@/types';

import { buildDecision, buildEvent, buildSnapshot } from '../fixtures/builders';
import { createTestDatabase } from '../fixtures/database';

const NOW = new Date('2026-03-01T12:00:00.000Z');

describe('SQLite repositories', () => {
  let connection: DatabaseConnection;
  let repos: Repositories;
  let dataset: ReturnType<typeof buildSeedDataset>;

  beforeEach(async () => {
    connection = await createTestDatabase();
    repos = createRepositories(connection.db, fixedClock(NOW));
    dataset = buildSeedDataset(NOW);

    for (const customer of dataset.customers) await repos.customers.create(customer);
    for (const journey of dataset.journeys) await repos.journeys.create(journey);
    for (const consent of dataset.consents) await repos.consents.upsert(consent);
    for (const event of dataset.events) await repos.events.create(event);
  });

  afterEach(() => {
    connection.close();
  });

  const primaryCustomer = () => dataset.customers[0]!;
  const primaryJourney = () => dataset.journeys[0]!;

  describe('customers', () => {
    it('round-trips a customer including nested preferences', async () => {
      const found = await repos.customers.findById(primaryCustomer().id);

      expect(found?.name).toBe('Priya Sharma');
      expect(found?.loyaltyTier).toBe('gold');
      expect(found?.preferences.priority).toBe('fastest');
      expect(found?.preferences.preferredAirlines).toEqual(['AF', 'KL', 'AI']);
    });

    it('looks a customer up by email', async () => {
      const found = await repos.customers.findByEmail('anika@journeyos.dev');
      expect(found?.loyaltyTier).toBe('silver');
    });

    it('returns undefined for an unknown id', async () => {
      const { CustomerIds } = await import('@/core/shared');
      expect(await repos.customers.findById(CustomerIds.generate())).toBeUndefined();
    });
  });

  describe('journeys', () => {
    it('excludes the current journey from history', async () => {
      const customerId = primaryCustomer().id;
      const history = await repos.journeys.listHistory(customerId, primaryJourney().id);

      expect(history).toHaveLength(3);
      expect(history.map((journey) => journey.id)).not.toContain(primaryJourney().id);
    });

    it('orders history newest first for multi-hop traversal', async () => {
      const history = await repos.journeys.listHistory(primaryCustomer().id, primaryJourney().id);
      const timestamps = history.map((journey) => journey.startedAt.getTime());

      expect([...timestamps].sort((a, b) => b - a)).toEqual(timestamps);
    });

    it('stamps completedAt when a journey reaches a terminal status', async () => {
      const updated = await repos.journeys.updateStatus(primaryJourney().id, 'completed');

      expect(updated.status).toBe('completed');
      expect(updated.completedAt).toEqual(NOW);
    });

    it('throws when updating a journey that does not exist', async () => {
      const { JourneyIds } = await import('@/core/shared');
      await expect(repos.journeys.updateStatus(JourneyIds.generate(), 'completed')).rejects.toBeInstanceOf(
        RecordNotFoundError,
      );
    });
  });

  describe('consents', () => {
    it('resolves a granted channel/purpose pair', async () => {
      const granted = await repos.consents.isGranted(primaryCustomer().id, 'email', 'automated_rebooking');
      expect(granted).toBe(true);
    });

    it('keeps consent scoped per channel and purpose', async () => {
      const customerId = primaryCustomer().id;

      expect(await repos.consents.isGranted(customerId, 'sms', 'marketing')).toBe(false);
      expect(await repos.consents.isGranted(customerId, 'sms', 'automated_rebooking')).toBe(false);
      expect(await repos.consents.isGranted(customerId, 'email', 'service_updates')).toBe(true);
    });

    it('treats a revoked grant as not granted', async () => {
      const customerId = primaryCustomer().id;
      await repos.consents.revoke(customerId, 'email', 'automated_rebooking');

      expect(await repos.consents.isGranted(customerId, 'email', 'automated_rebooking')).toBe(false);
    });

    it('upserts rather than duplicating an existing pair', async () => {
      const customerId = primaryCustomer().id;
      await repos.consents.upsert({
        id: ConsentIds.generate(),
        customerId,
        channel: 'email',
        purpose: 'service_updates',
        granted: false,
        source: 'test',
        capturedAt: NOW,
      });

      const all = await repos.consents.listByCustomer(customerId);
      const matching = all.filter((c) => c.channel === 'email' && c.purpose === 'service_updates');

      expect(matching).toHaveLength(1);
      expect(matching[0]?.granted).toBe(false);
    });
  });

  describe('events', () => {
    it('enforces correlation-id uniqueness so ingestion is idempotent', async () => {
      const event = buildEvent(primaryCustomer().id, primaryJourney().id);
      await repos.events.create(event);

      await expect(repos.events.create({ ...event, id: buildEvent(primaryCustomer().id, primaryJourney().id).id })).rejects.toThrow();
    });

    it('finds an existing event by correlation id', async () => {
      const event = buildEvent(primaryCustomer().id, primaryJourney().id);
      const created = await repos.events.create(event);

      const found = await repos.events.findByCorrelationId(event.correlationId);
      expect(found?.id).toBe(created.id);
    });

    it('attaches an unlinked event to a journey', async () => {
      const created = await repos.events.create(
        buildEvent(primaryCustomer().id, primaryJourney().id, { journeyId: null }),
      );
      expect(created.journeyId).toBeNull();

      const attached = await repos.events.attachToJourney(created.id, primaryJourney().id);
      expect(attached.journeyId).toBe(primaryJourney().id);
    });

    it('lists historical events per customer for incident counting', async () => {
      const history = await repos.events.listByCustomer(primaryCustomer().id);

      expect(history).toHaveLength(2);
      expect(history.map((event) => event.type)).toContain('FlightCancelled');
    });
  });

  describe('decisions', () => {
    it('preserves the snapshot link, scores, and trust evaluation', async () => {
      const event = await repos.events.create(buildEvent(primaryCustomer().id, primaryJourney().id));
      const snapshot = await repos.snapshots.create(
        buildSnapshot(primaryJourney().id, primaryCustomer().id, event.id),
      );
      const created = await repos.decisions.create(
        buildDecision(primaryJourney().id, event.id, snapshot.id),
      );

      const found = await repos.decisions.findById(created.id);

      expect(found?.snapshotId).toBe(snapshot.id);
      expect(found?.bestOption.scores.arrivalTime).toBe(80);
      expect(found?.alternatives).toHaveLength(1);
      expect(found?.trust.outcome).toBe('needs_customer_approval');
      expect(found?.trust.riskScore).toBe(42);
      expect(found?.planner).toBe('deterministic_fallback');
    });

    it('round-trips confidence without floating-point drift', async () => {
      const event = await repos.events.create(buildEvent(primaryCustomer().id, primaryJourney().id));
      const snapshot = await repos.snapshots.create(
        buildSnapshot(primaryJourney().id, primaryCustomer().id, event.id),
      );
      const created = await repos.decisions.create(
        buildDecision(primaryJourney().id, event.id, snapshot.id, { confidence: 0.8237 }),
      );

      expect((await repos.decisions.findById(created.id))?.confidence).toBe(0.8237);
    });

    it('records approval with a decided-at timestamp', async () => {
      const event = await repos.events.create(buildEvent(primaryCustomer().id, primaryJourney().id));
      const snapshot = await repos.snapshots.create(
        buildSnapshot(primaryJourney().id, primaryCustomer().id, event.id),
      );
      const created = await repos.decisions.create(
        buildDecision(primaryJourney().id, event.id, snapshot.id),
      );

      const approved = await repos.decisions.updateStatus(created.id, 'approved', NOW);

      expect(approved.status).toBe('approved');
      expect(approved.decidedAt).toEqual(NOW);
    });
  });

  describe('actions', () => {
    const seedAction = async () => {
      const event = await repos.events.create(buildEvent(primaryCustomer().id, primaryJourney().id));
      const snapshot = await repos.snapshots.create(
        buildSnapshot(primaryJourney().id, primaryCustomer().id, event.id),
      );
      const decision = await repos.decisions.create(
        buildDecision(primaryJourney().id, event.id, snapshot.id),
      );

      return repos.actions.create({
        id: ActionIds.generate(),
        decisionId: decision.id,
        journeyId: primaryJourney().id,
        type: 'rebookFlight',
        status: 'pending_approval',
        idempotencyKey: idempotencyKeyFrom(decision.id, 'rebookFlight'),
        request: { flightNumber: 'AF193', cabin: 'business' },
      });
    };

    it('blocks a duplicate idempotency key at the database level', async () => {
      const action = await seedAction();

      await expect(
        repos.actions.create({
          id: ActionIds.generate(),
          decisionId: action.decisionId,
          journeyId: action.journeyId,
          type: 'rebookFlight',
          status: 'pending_approval',
          idempotencyKey: action.idempotencyKey,
          request: {},
        }),
      ).rejects.toThrow();
    });

    it('returns the original action for a repeated idempotency key', async () => {
      const action = await seedAction();
      const found = await repos.actions.findByIdempotencyKey(action.idempotencyKey);

      expect(found?.id).toBe(action.id);
    });

    it('moves through approval and execution', async () => {
      const action = await seedAction();

      const approved = await repos.actions.markApproved(action.id, 'customer', NOW);
      expect(approved.status).toBe('approved');
      expect(approved.approvedBy).toBe('customer');

      const executed = await repos.actions.markExecuted(action.id, { pnr: 'JX7QK2' }, NOW);
      expect(executed.status).toBe('succeeded');
      expect(executed.result).toEqual({ pnr: 'JX7QK2' });
      expect(executed.executedAt).toEqual(NOW);
    });

    it('records a failure reason', async () => {
      const action = await seedAction();
      const failed = await repos.actions.markFailed(action.id, 'No inventory on AF193');

      expect(failed.status).toBe('failed');
      expect(failed.failureReason).toBe('No inventory on AF193');
    });
  });

  describe('audit ledger', () => {
    it('returns records for a journey in chronological order', async () => {
      const journeyId = primaryJourney().id;
      const correlationId = dataset.events[0]!.correlationId;

      const stages = ['event', 'context', 'trust', 'plan'] as const;
      for (const [index, stage] of stages.entries()) {
        await repos.audit.append({
          id: AuditRecordIds.generate(),
          journeyId,
          correlationId,
          stage,
          actor: 'system',
          action: `stage.${stage}`,
          outcome: 'success',
          summary: `Completed ${stage}`,
          payload: { step: index },
          occurredAt: new Date(NOW.getTime() + index * 1_000),
        });
      }

      const trail = await repos.audit.listByJourney(journeyId);

      expect(trail).toHaveLength(4);
      expect(trail.map((record) => record.stage)).toEqual([...stages]);
    });

    it('filters the trail by correlation id and by stage', async () => {
      const journeyId = primaryJourney().id;
      const correlationId = dataset.events[0]!.correlationId;

      await repos.audit.append({
        id: AuditRecordIds.generate(),
        journeyId,
        correlationId,
        stage: 'trust',
        actor: 'trust_kernel',
        action: 'trust.evaluate',
        outcome: 'denied',
        summary: 'Stale fare data',
        payload: { riskScore: 88 },
      });

      expect(await repos.audit.listByCorrelationId(correlationId)).toHaveLength(1);
      expect(await repos.audit.listByStage(journeyId, 'trust')).toHaveLength(1);
      expect(await repos.audit.listByStage(journeyId, 'execute')).toHaveLength(0);
    });
  });
});
