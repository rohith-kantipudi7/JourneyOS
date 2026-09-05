import { NextResponse } from 'next/server';

import { getDatabaseConnection } from '@/db';
import { runSeedPipeline, seedDatabase } from '@/db/seed';
import { getEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Wipes and repopulates the demo dataset so a run can be replayed cleanly
 * between takes. Deliberately unavailable in production.
 */
export async function POST(): Promise<NextResponse> {
  if (getEnv().NODE_ENV === 'production') {
    return NextResponse.json(
      { error: { code: 'forbidden', message: 'Demo reset is disabled in production.' } },
      { status: 403 },
    );
  }

  const { db } = getDatabaseConnection();
  const dataset = await seedDatabase(db);
  const pipeline = await runSeedPipeline(db);

  return NextResponse.json({
    reset: true,
    customers: dataset.customers.length,
    journeys: dataset.journeys.length,
    consents: dataset.consents.length,
    events: dataset.events.length,
    decisions: pipeline.decisions,
    executed: pipeline.executed,
    policyBlocked: pipeline.blocked,
    primaryJourneyId: dataset.primaryJourneyId,
  });
}
