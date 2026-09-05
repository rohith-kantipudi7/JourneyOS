import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CustomerIds, JourneyIds, fixedClock, newCorrelationId } from '@/core/shared';
import type { DatabaseConnection } from '@/db/client';
import { createRepositories } from '@/db/repositories';
import { buildSeedDataset } from '@/db/seed';
import { EventGateway, SCENARIOS } from '@/events';
import type { Repositories } from '@/types';

import { createTestDatabase } from '../fixtures/database';

const NOW = new Date('2026-03-01T12:00:00.000Z');

describe('EventGateway', () => {
  let connection: DatabaseConnection;
  let repos: Repositories;
  let gateway: EventGateway;
  let dataset: ReturnType<typeof buildSeedDataset>;

  beforeEach(async () => {
    connection = await createTestDatabase();
    repos = createRepositories(connection.db, fixedClock(NOW));
    gateway = new EventGateway({ repositories: repos, clock: fixedClock(NOW) });
    dataset = buildSeedDataset(NOW);

    for (const customer of dataset.customers) await repos.customers.create(customer);
    for (const journey of dataset.journeys) await repos.journeys.create(journey);
    for (const consent of dataset.consents) await repos.consents.upsert(consent);
  });

  afterEach(() => connection.close());

  const Priya = () => dataset.customers[0]!;
  const activeJourney = () => dataset.journeys[0]!;

  const cancellation = (overrides: Record<string, unknown> = {}) =>
    SCENARIOS.flight_cancelled.build({ customerId: Priya().id, now: NOW, ...overrides });

  describe('validation', () => {
    it('rejects a payload that fails schema validation', async () => {
      const result = await gateway.ingest({ type: 'FlightCancelled', payload: {} });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('validation_failed');
      expect(Object.keys(result.error.fieldErrors ?? {}).length).toBeGreaterThan(0);
    });

    it('rejects an event for an unknown customer', async () => {
      const result = await gateway.ingest(
        SCENARIOS.flight_cancelled.build({ customerId: CustomerIds.generate(), now: NOW }),
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('customer_not_found');
    });

    it('rejects a journey belonging to a different customer', async () => {
      const anikaJourney = dataset.journeys.find((j) => j.customerId === dataset.customers[1]!.id)!;
      const result = await gateway.ingest(cancellation({ journeyId: anikaJourney.id }));

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('journey_ownership_mismatch');
    });

    it('rejects an unknown journey id', async () => {
      const result = await gateway.ingest(cancellation({ journeyId: JourneyIds.generate() }));

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('journey_not_found');
    });
  });

  describe('journey attachment', () => {
    it('attaches to the customer open journey of the matching pack', async () => {
      const result = await gateway.ingest(cancellation());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.journey.id).toBe(activeJourney().id);
      expect(result.value.journeyCreated).toBe(false);
    });

    it('creates a journey when no open journey matches the pack', async () => {
      const result = await gateway.ingest(SCENARIOS.order_delayed.build({ customerId: Priya().id, now: NOW }));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.journeyCreated).toBe(true);
      expect(result.value.journey.template).toBe('retail.order_recovery');
      expect(result.value.journey.goal).toContain('ORD-55021');
    });

    it('flips an active journey to disrupted on a high-severity event', async () => {
      const result = await gateway.ingest(cancellation());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.journeyStatusChanged).toBe(true);
      expect(result.value.journey.status).toBe('disrupted');
    });

    it('leaves journey status untouched for a low-severity event', async () => {
      const result = await gateway.ingest(
        SCENARIOS.flight_delayed_minor.build({ customerId: Priya().id, now: NOW }),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.severity).toBe('low');
      expect(result.value.journeyStatusChanged).toBe(false);
      expect(result.value.journey.status).toBe('active');
    });

    it('attaches a complaint to an existing journey rather than creating one', async () => {
      const result = await gateway.ingest(
        SCENARIOS.angry_complaint.build({ customerId: Priya().id, now: NOW }),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.journeyCreated).toBe(false);
      expect(result.value.journey.id).toBe(activeJourney().id);
    });

    it('refuses a complaint when the customer has no open journey', async () => {
      const anika = dataset.customers[1]!;
      const anikaJourney = dataset.journeys.find((j) => j.customerId === anika.id)!;
      await repos.journeys.updateStatus(anikaJourney.id, 'completed');

      const result = await gateway.ingest(SCENARIOS.angry_complaint.build({ customerId: anika.id, now: NOW }));

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('journey_required');
    });
  });

  describe('idempotency', () => {
    it('does not duplicate journey state when the same event is replayed', async () => {
      const correlationId = newCorrelationId();
      const event = cancellation({ correlationId });

      const first = await gateway.ingest(event);
      const second = await gateway.ingest(event);

      expect(first.ok && second.ok).toBe(true);
      if (!first.ok || !second.ok) return;

      expect(first.value.duplicate).toBe(false);
      expect(second.value.duplicate).toBe(true);
      expect(second.value.event.id).toBe(first.value.event.id);

      const stored = await repos.events.listByJourney(activeJourney().id);
      expect(stored).toHaveLength(1);
      expect(second.value.journeyStatusChanged).toBe(false);
    });

    it('treats distinct correlation ids as distinct events', async () => {
      await gateway.ingest(cancellation({ correlationId: newCorrelationId() }));
      await gateway.ingest(cancellation({ correlationId: newCorrelationId() }));

      expect(await repos.events.listByJourney(activeJourney().id)).toHaveLength(2);
    });
  });

  describe('audit trail', () => {
    it('opens the trail with an event-stage record', async () => {
      const correlationId = newCorrelationId();
      await gateway.ingest(cancellation({ correlationId }));

      const trail = await repos.audit.listByCorrelationId(correlationId);

      expect(trail).toHaveLength(1);
      expect(trail[0]?.stage).toBe('event');
      expect(trail[0]?.outcome).toBe('success');
      expect(trail[0]?.action).toBe('event.FlightCancelled');
    });

    it('records a suppressed duplicate as skipped', async () => {
      const correlationId = newCorrelationId();
      await gateway.ingest(cancellation({ correlationId }));
      await gateway.ingest(cancellation({ correlationId }));

      const trail = await repos.audit.listByCorrelationId(correlationId);

      expect(trail).toHaveLength(2);
      expect(trail[1]?.outcome).toBe('skipped');
      expect(trail[1]?.action).toBe('event.duplicate_suppressed');
    });
  });

  describe('simulator scenarios', () => {
    it('every scenario passes the same validation gate as external traffic', async () => {
      const scenarios = Object.values(SCENARIOS).filter((s) => s.eventType !== 'CustomerComplaint');

      for (const scenario of scenarios) {
        const result = await gateway.ingest(scenario.build({ customerId: Priya().id, now: NOW }));
        expect(result.ok, `${scenario.id} should ingest`).toBe(true);
      }
    });
  });
});
