import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ContentstackAdapter, findLocalTemplate, LOCAL_TEMPLATES } from '@/adapters';
import { applyChannelLimits, findTokens, renderTemplate } from '@/core/content';
import { fixedClock } from '@/core/shared';
import type { DatabaseConnection } from '@/db/client';
import { createRepositories } from '@/db/repositories';
import { buildSeedDataset } from '@/db/seed';
import { SCENARIOS } from '@/events';
import { buildContainer, type ServiceContainer } from '@/services';
import { createSimulatedAdapters } from '@/adapters';
import type { ContentTemplate } from '@/types';

import { createTestDatabase } from '../fixtures/database';

const NOW = new Date('2026-03-01T12:00:00.000Z');

describe('content composition', () => {
  const template: ContentTemplate = {
    uid: 't1',
    templateKey: 'test',
    channel: 'email',
    locale: 'en-IN',
    subject: 'Hello {{customerName}}',
    body: 'Your flight {{flightNumber}} to {{destination}} — {{explanation}}',
    cta: 'Confirm',
    source: 'local',
  };

  it('substitutes every supplied token', () => {
    const rendered = renderTemplate(template, {
      customerName: 'Priya',
      flightNumber: 'AF191',
      destination: 'Paris',
      explanation: 'We rebooked you.',
    });

    expect(rendered.subject).toBe('Hello Priya');
    expect(rendered.body).toContain('AF191');
    expect(rendered.missingTokens).toEqual([]);
  });

  it('reports unresolved tokens instead of shipping raw placeholders', () => {
    const rendered = renderTemplate(template, { customerName: 'Priya' });

    expect(rendered.missingTokens).toContain('flightNumber');
    expect(rendered.body).not.toContain('{{flightNumber}}');
    expect(rendered.body).toContain('[flightNumber]');
  });

  it('is a pure function of template and variables', () => {
    const variables = { customerName: 'A', flightNumber: 'B', destination: 'C', explanation: 'D' };
    expect(renderTemplate(template, variables)).toEqual(renderTemplate(template, variables));
  });

  it('extracts the token list from a template', () => {
    expect(findTokens(template.body).sort()).toEqual(['destination', 'explanation', 'flightNumber']);
  });

  it('truncates a push body at the channel limit', () => {
    const long = { ...template, channel: 'push' as const, body: 'x'.repeat(400) };
    const rendered = applyChannelLimits(renderTemplate(long, {}));

    expect(rendered.body.length).toBeLessThanOrEqual(178);
    expect(rendered.body.endsWith('…')).toBe(true);
  });

  it('leaves an email body untouched', () => {
    const rendered = applyChannelLimits(renderTemplate(template, { customerName: 'Priya' }));
    expect(rendered.body).toBe(renderTemplate(template, { customerName: 'Priya' }).body);
  });
});

describe('template sources', () => {
  it('ships a local template for every channel', () => {
    const channels = new Set(LOCAL_TEMPLATES.map((t) => t.channel));
    expect(channels).toEqual(new Set(['email', 'push', 'in_app', 'agent']));
  });

  it('falls back across locales rather than returning nothing', () => {
    expect(findLocalTemplate('travel.disruption_recovery', 'email', 'fr-FR')).not.toBeNull();
  });

  it('reports itself as not live without credentials', () => {
    const adapter = new ContentstackAdapter({
      apiKey: undefined,
      deliveryToken: undefined,
      environment: 'development',
      region: 'us',
      contentTypeUid: 'journey_message',
    });

    expect(adapter.live).toBe(false);
  });

  it('serves local templates when Contentstack is unconfigured', async () => {
    const adapter = new ContentstackAdapter({
      apiKey: undefined,
      deliveryToken: undefined,
      environment: 'development',
      region: 'us',
      contentTypeUid: 'journey_message',
    });

    const templates = await adapter.listTemplates('travel.disruption_recovery');
    expect(templates).toHaveLength(4);
    expect(templates.every((t) => t.source === 'local')).toBe(true);
  });
});

describe('ContentService', () => {
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

  async function planFor(customerId: (typeof dataset.customers)[number]['id']) {
    const ingested = await container.eventGateway.ingest(
      SCENARIOS.flight_cancelled.build({ customerId, now: NOW }),
    );
    if (!ingested.ok) throw new Error('ingest failed');

    const planned = await container.decisions.plan({ journeyId: ingested.value.journey.id });
    if (!planned.ok) throw new Error(`plan failed: ${planned.error.code}`);
    return planned.value.decision;
  }

  it('renders the same decision across all four channels', async () => {
    const decision = await planFor(dataset.customers[0]!.id);
    const result = await container.content.compose({ decisionId: decision.id });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.channels.map((c) => c.channel).sort()).toEqual([
      'agent',
      'email',
      'in_app',
      'push',
    ]);
  });

  it('binds the decision into every rendered channel', async () => {
    const decision = await planFor(dataset.customers[0]!.id);
    const result = await container.content.compose({ decisionId: decision.id });
    if (!result.ok) return;

    for (const channel of result.value.channels.filter((c) => c.consented)) {
      expect(channel.message?.body).toContain(decision.bestOption.label);
    }
  });

  it('leaves no unresolved tokens in any channel', async () => {
    const decision = await planFor(dataset.customers[0]!.id);
    const result = await container.content.compose({ decisionId: decision.id });
    if (!result.ok) return;

    for (const channel of result.value.channels) {
      expect(channel.message?.missingTokens ?? []).toEqual([]);
    }
  });

  it('states real flight times rather than a placeholder', async () => {
    const decision = await planFor(dataset.customers[0]!.id);
    const result = await container.content.compose({ decisionId: decision.id });
    if (!result.ok) return;

    const email = result.value.channels.find((c) => c.channel === 'email');
    expect(email?.message?.body).not.toContain('to be confirmed');
    expect(email?.message?.body).toMatch(/Departure: \d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    expect(email?.message?.body).toMatch(/Arrival: \d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
  });

  it('gives the agent brief the trust verdict the customer copy omits', async () => {
    const decision = await planFor(dataset.customers[0]!.id);
    const result = await container.content.compose({ decisionId: decision.id });
    if (!result.ok) return;

    const agent = result.value.channels.find((c) => c.channel === 'agent');
    const email = result.value.channels.find((c) => c.channel === 'email');

    expect(agent?.message?.body).toContain('needs customer approval');
    expect(agent?.message?.body).toContain(decision.trust.policyVersion);
    expect(email?.message?.body).not.toContain('policy');
  });

  it('falls back to deterministic copy with no AI configured', async () => {
    const decision = await planFor(dataset.customers[0]!.id);
    const result = await container.content.compose({ decisionId: decision.id });
    if (!result.ok) return;

    expect(result.value.copySource).toBe('deterministic');
    expect(result.value.live).toBe(false);
    expect(result.value.provider).toBe('contentstack');
  });

  it('writes a content audit record', async () => {
    const decision = await planFor(dataset.customers[0]!.id);
    await container.content.compose({ decisionId: decision.id });

    const trail = await container.repositories.audit.listByJourney(decision.journeyId);
    expect(trail.some((record) => record.action === 'content.composed')).toBe(true);
  });

  it('rejects an unknown decision', async () => {
    const { DecisionIds } = await import('@/core/shared');
    const result = await container.content.compose({ decisionId: DecisionIds.generate() });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('decision_not_found');
  });
});
