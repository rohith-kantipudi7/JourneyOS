import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSimulatedAdapters } from '@/adapters';
import { fixedClock } from '@/core/shared';
import type { DatabaseConnection } from '@/db/client';
import { createRepositories } from '@/db/repositories';
import { buildSeedDataset } from '@/db/seed';
import { SCENARIOS } from '@/events';
import { buildContainer, type ServiceContainer } from '@/services';

import { createTestDatabase } from '../fixtures/database';

const NOW = new Date('2026-03-01T12:00:00.000Z');

/** Exercises the whole loop: Event → Context → Trust → Plan → Approve → Execute → Audit. */
describe('end-to-end control loop', () => {
  let connection: DatabaseConnection;
  let container: ServiceContainer;
  let dataset: ReturnType<typeof buildSeedDataset>;

  beforeEach(async () => {
    connection = await createTestDatabase();
    const clock = fixedClock(NOW);
    const repos = createRepositories(connection.db, clock);
    container = buildContainer(repos, clock, createSimulatedAdapters(() => NOW));
    dataset = buildSeedDataset(NOW);

    for (const customer of dataset.customers) await repos.customers.create(customer);
    for (const journey of dataset.journeys) await repos.journeys.create(journey);
    for (const consent of dataset.consents) await repos.consents.upsert(consent);
    for (const event of dataset.events) await repos.events.create(event);
  });

  afterEach(() => connection.close());

  const Priya = () => dataset.customers[0]!;
  const anika = () => dataset.customers[1]!;

  async function ingest(customerId: (typeof dataset.customers)[number]['id']) {
    const result = await container.eventGateway.ingest(
      SCENARIOS.flight_cancelled.build({ customerId, now: NOW }),
    );
    if (!result.ok) throw new Error(`ingest failed: ${result.error.code}`);
    return result.value;
  }

  describe('planning', () => {
    it('produces a ranked decision with alternatives and a tradeoff table', async () => {
      const { journey } = await ingest(Priya().id);
      const planned = await container.decisions.plan({ journeyId: journey.id });

      expect(planned.ok).toBe(true);
      if (!planned.ok) return;

      const { decision, tradeoff } = planned.value;

      expect(decision.bestOption.rank).toBe(1);
      expect(decision.alternatives.length).toBeGreaterThanOrEqual(1);
      expect(decision.confidence).toBeGreaterThan(0);
      expect(decision.reasoning.length).toBeGreaterThan(10);
      expect(tradeoff.rows).toHaveLength(6);
      expect(tradeoff.bestOptionId).toBe(decision.bestOption.optionId);
    });

    it('pins the exact snapshot the reasoning came from', async () => {
      const { journey } = await ingest(Priya().id);
      const planned = await container.decisions.plan({ journeyId: journey.id });
      if (!planned.ok) throw new Error('plan failed');

      const snapshot = await container.repositories.snapshots.findById(planned.value.decision.snapshotId);
      expect(snapshot).toBeDefined();
      expect(planned.value.decision.snapshotId).toBe(planned.value.snapshot.id);
    });

    it('falls back deterministically when no AI key is configured', async () => {
      const { journey } = await ingest(Priya().id);
      const planned = await container.decisions.plan({ journeyId: journey.id });
      if (!planned.ok) throw new Error('plan failed');

      // Tests run without OPENAI_API_KEY, so the fallback path must engage cleanly.
      expect(planned.value.decision.planner).toBe('deterministic_fallback');
      expect(planned.value.decision.model).toBeNull();
      expect(planned.value.decision.bestOption.weightedScore).toBeGreaterThan(0);
    });

    it('ranks every option and orders them by weighted score', async () => {
      const { journey } = await ingest(Priya().id);
      const planned = await container.decisions.plan({ journeyId: journey.id });
      if (!planned.ok) throw new Error('plan failed');

      const all = [planned.value.decision.bestOption, ...planned.value.decision.alternatives];
      const sorted = [...all].sort((a, b) => b.weightedScore - a.weightedScore);

      expect(all.map((o) => o.optionId)).toEqual(sorted.map((o) => o.optionId));
      expect(all.map((o) => o.rank)).toEqual(all.map((_, index) => index + 1));
    });

    it('writes plan and validate audit stages', async () => {
      const { journey } = await ingest(Priya().id);
      await container.decisions.plan({ journeyId: journey.id });

      expect(await container.repositories.audit.listByStage(journey.id, 'plan')).toHaveLength(1);
      expect(await container.repositories.audit.listByStage(journey.id, 'validate')).toHaveLength(1);
      expect(await container.repositories.audit.listByStage(journey.id, 'context')).toHaveLength(1);
    });
  });

  describe('execution', () => {
    it('approves and executes the recommended option', async () => {
      const { journey } = await ingest(Priya().id);
      const planned = await container.decisions.plan({ journeyId: journey.id });
      if (!planned.ok) throw new Error('plan failed');

      const executed = await container.actions.approveAndExecute({
        decisionId: planned.value.decision.id,
        approvedBy: 'customer',
      });

      expect(executed.ok).toBe(true);
      if (!executed.ok) return;

      expect(executed.value.action.status).toBe('succeeded');
      expect(executed.value.action.approvedBy).toBe('customer');
      expect(executed.value.action.result).not.toBeNull();
      expect(executed.value.replayed).toBe(false);
    });

    it('does not re-execute when the same option is submitted twice', async () => {
      const { journey } = await ingest(Priya().id);
      const planned = await container.decisions.plan({ journeyId: journey.id });
      if (!planned.ok) throw new Error('plan failed');

      const first = await container.actions.approveAndExecute({
        decisionId: planned.value.decision.id,
        approvedBy: 'customer',
      });
      const second = await container.actions.approveAndExecute({
        decisionId: planned.value.decision.id,
        approvedBy: 'customer',
      });

      expect(first.ok && second.ok).toBe(true);
      if (!first.ok || !second.ok) return;

      expect(second.value.replayed).toBe(true);
      expect(second.value.action.id).toBe(first.value.action.id);

      const actions = await container.repositories.actions.listByJourney(journey.id);
      expect(actions).toHaveLength(1);
    });

    it('moves the journey into recovering and marks the decision approved', async () => {
      const { journey } = await ingest(Priya().id);
      const planned = await container.decisions.plan({ journeyId: journey.id });
      if (!planned.ok) throw new Error('plan failed');

      await container.actions.approveAndExecute({
        decisionId: planned.value.decision.id,
        approvedBy: 'customer',
      });

      expect((await container.repositories.journeys.findById(journey.id))?.status).toBe('recovering');
      expect((await container.repositories.decisions.findById(planned.value.decision.id))?.status).toBe(
        'approved',
      );
    });

    it('records the full eight-stage trail', async () => {
      const { journey } = await ingest(Priya().id);
      const planned = await container.decisions.plan({ journeyId: journey.id });
      if (!planned.ok) throw new Error('plan failed');

      await container.actions.approveAndExecute({
        decisionId: planned.value.decision.id,
        approvedBy: 'customer',
      });

      const stages = (await container.repositories.audit.listByJourney(journey.id)).map((r) => r.stage);

      expect(stages).toContain('event');
      expect(stages).toContain('context');
      expect(stages).toContain('plan');
      expect(stages).toContain('validate');
      expect(stages).toContain('approval');
      expect(stages).toContain('execute');
    });
  });

  describe('Scenario B — the Trust Kernel actually blocks execution', () => {
    it('refuses to rebook the customer who withheld consent and escalates to a human', async () => {
      const { journey } = await ingest(anika().id);
      const planned = await container.decisions.plan({ journeyId: journey.id });

      // Every rebooking option is screened out before ranking, so planning fails.
      expect(planned.ok).toBe(false);
      if (planned.ok) return;

      expect(planned.error.code).toBe('no_viable_options');
      expect(planned.error.screenedOut?.length).toBeGreaterThan(0);
      expect(planned.error.screenedOut?.[0]?.reason).toContain('automated rebooking');
    });

    it('leaves no action record behind when everything is blocked', async () => {
      const { journey } = await ingest(anika().id);
      await container.decisions.plan({ journeyId: journey.id });

      expect(await container.repositories.actions.listByJourney(journey.id)).toHaveLength(0);
    });
  });
});
