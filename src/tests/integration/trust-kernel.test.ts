import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { JourneyContextBuilder } from '@/core/journey';
import { TrustKernel, buildTrustContext } from '@/core/trust';
import { fixedClock } from '@/core/shared';
import type { DatabaseConnection } from '@/db/client';
import { createRepositories } from '@/db/repositories';
import { buildSeedDataset } from '@/db/seed';
import { EventGateway, SCENARIOS } from '@/events';
import type { ContextSnapshot, ProposedAction, Repositories } from '@/types';

import { createTestDatabase } from '../fixtures/database';

const NOW = new Date('2026-03-01T12:00:00.000Z');

describe('Trust Kernel over a real context snapshot', () => {
  let connection: DatabaseConnection;
  let repos: Repositories;
  let gateway: EventGateway;
  let builder: JourneyContextBuilder;
  let dataset: ReturnType<typeof buildSeedDataset>;
  const kernel = new TrustKernel();

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

  const VOUCHER: ProposedAction = { type: 'issueVoucher', estimatedCost: 120, currency: 'EUR' };
  const REBOOK: ProposedAction = { type: 'rebookFlight', estimatedCost: 240, currency: 'EUR' };

  describe('projection from the graph', () => {
    it('extracts tier, consent, and history from the snapshot', async () => {
      const context = buildTrustContext(await snapshotFor(Priya().id), VOUCHER);

      expect(context.loyaltyTier).toBe('gold');
      expect(context.contextRisk).toBe(75);
      expect(context.priorIncidents.compensationWithin30Days).toBe(true);
      expect(context.grantedConsents).toContainEqual({ channel: 'email', purpose: 'automated_rebooking' });
    });

    it('excludes withheld consent from the granted list', async () => {
      const context = buildTrustContext(await snapshotFor(anika().id), REBOOK);

      expect(context.grantedConsents).not.toContainEqual({
        channel: 'email',
        purpose: 'automated_rebooking',
      });
      expect(context.grantedConsents).toContainEqual({ channel: 'email', purpose: 'service_updates' });
    });

    it('carries stale inputs through with their source system', async () => {
      const context = buildTrustContext(await snapshotFor(Priya().id), VOUCHER);

      expect(context.staleInputs.length).toBeGreaterThan(0);
      expect(context.staleInputs.every((input) => input.sourceSystem === 'consent_store')).toBe(true);
    });
  });

  describe('Scenario B — governance is not cosmetic', () => {
    it('blocks automated rebooking for the customer who withheld consent', async () => {
      const decision = kernel.evaluate(buildTrustContext(await snapshotFor(anika().id), REBOOK));

      expect(decision.outcome).toBe('hard_deny');
      expect(decision.failedRuleIds).toContain('consent.automated_rebooking');
      expect(decision.headline).toContain('not consented to automated rebooking');
    });

    it('permits the same rebooking for the customer who granted consent', async () => {
      const decision = kernel.evaluate(buildTrustContext(await snapshotFor(Priya().id), REBOOK));

      expect(decision.outcome).not.toBe('hard_deny');
      expect(decision.failedRuleIds).not.toContain('consent.automated_rebooking');
    });
  });

  describe('history changes the tier end to end', () => {
    it('escalates the Gold customer and auto-approves the Silver one', async () => {
      const gold = kernel.evaluate(buildTrustContext(await snapshotFor(Priya().id), VOUCHER));
      const silver = kernel.evaluate(buildTrustContext(await snapshotFor(anika().id), VOUCHER));

      expect(gold.outcome).toBe('needs_customer_approval');
      expect(silver.outcome).toBe('auto_approve');
      expect(gold.riskScore).toBeGreaterThan(silver.riskScore);
    });

    it('names the rule responsible, so the UI can explain the escalation', async () => {
      const gold = kernel.evaluate(buildTrustContext(await snapshotFor(Priya().id), VOUCHER));

      expect(gold.failedRuleIds).toEqual(['policy.repeat_compensation']);
      const check = gold.checks.find((c) => c.policyId === 'policy.repeat_compensation');
      expect(check?.passed).toBe(false);
      expect(check?.reason).toContain('€120');
    });

    it('surfaces every risk factor with its weight for the Decision Inspector', async () => {
      const gold = kernel.evaluate(buildTrustContext(await snapshotFor(Priya().id), VOUCHER));

      expect(gold.riskFactors.map((f) => f.id)).toEqual([
        'spend',
        'history',
        'freshness',
        'tier',
        'reversibility',
      ]);
      expect(gold.riskFactors.reduce((sum, f) => sum + f.weight, 0)).toBeCloseTo(1);
      expect(gold.riskFactors.find((f) => f.id === 'history')?.value).toBe(75);
    });
  });
});
