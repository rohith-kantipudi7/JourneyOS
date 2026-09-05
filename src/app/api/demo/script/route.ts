import { NextResponse } from 'next/server';

import { DEMO_SCRIPT } from '@/lib/demo-script';
import { getContainer } from '@/services';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The scripted demo scenarios, resolved against the current seed so each one
 * carries live ids rather than a stale click path.
 */
export async function GET(): Promise<NextResponse> {
  const { repositories } = getContainer();

  const scenarios = await Promise.all(
    DEMO_SCRIPT.map(async (scenario) => {
      const customer = await repositories.customers.findByEmail(scenario.customerEmail);
      const journeys = customer ? await repositories.journeys.listByCustomer(customer.id) : [];
      const open = journeys.find((journey) =>
        ['active', 'disrupted', 'recovering'].includes(journey.status),
      );

      return {
        id: scenario.id,
        title: scenario.title,
        proves: scenario.proves,
        trigger: scenario.trigger,
        steps: scenario.steps,
        talkTrack: scenario.talkTrack,
        customerId: customer?.id ?? null,
        customerName: customer?.name ?? null,
        journeyId: open?.id ?? null,
      };
    }),
  );

  return NextResponse.json({ scenarios });
}
