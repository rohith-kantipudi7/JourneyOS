import { NextResponse } from 'next/server';

import { getContainer } from '@/services';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OPEN = new Set(['active', 'disrupted', 'recovering']);

/** Seeded customers with their current open journey — bootstraps the console. */
export async function GET(): Promise<NextResponse> {
  const { repositories } = getContainer();
  const customers = await repositories.customers.list();

  const rows = await Promise.all(
    customers.map(async (customer) => {
      const journeys = await repositories.journeys.listByCustomer(customer.id);
      const open = journeys.find((journey) => OPEN.has(journey.status));

      const [events, decisions, actions] = open
        ? await Promise.all([
            repositories.events.listByJourney(open.id),
            repositories.decisions.listByJourney(open.id),
            repositories.actions.listByJourney(open.id),
          ])
        : [[], [], []];

      const latest = events.at(-1);

      return {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        loyaltyTier: customer.loyaltyTier,
        loyaltyPoints: customer.loyaltyPoints,
        preferences: customer.preferences,
        journeyCount: journeys.length,
        eventCount: events.length,
        decisionCount: decisions.length,
        actionCount: actions.length,
        latestEvent: latest ? { type: latest.type, severity: latest.severity } : null,
        activeJourney: open
          ? { id: open.id, goal: open.goal, status: open.status, template: open.template }
          : null,
      };
    }),
  );

  // Most fully-processed journeys first, so the console opens on one that has a
  // graph, a verdict, a proposal, and a ledger rather than an empty shell.
  rows.sort(
    (a, b) =>
      b.actionCount - a.actionCount ||
      b.decisionCount - a.decisionCount ||
      b.eventCount - a.eventCount ||
      b.journeyCount - a.journeyCount ||
      a.name.localeCompare(b.name),
  );

  return NextResponse.json({ customers: rows });
}
