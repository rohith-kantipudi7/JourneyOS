import { NextResponse } from 'next/server';

import { JourneyIds } from '@/core/shared';
import { getContainer } from '@/services';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Everything the operator console needs to render one journey. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  if (!JourneyIds.is(id)) {
    return NextResponse.json(
      { error: { code: 'validation_failed', message: 'Expected a JourneyId.' } },
      { status: 400 },
    );
  }

  const { repositories } = getContainer();
  const journey = await repositories.journeys.findById(id);

  if (!journey) {
    return NextResponse.json(
      { error: { code: 'journey_not_found', message: `No journey exists with id ${id}.` } },
      { status: 404 },
    );
  }

  const [customer, events, audit, decisions] = await Promise.all([
    repositories.customers.findById(journey.customerId),
    repositories.events.listByJourney(id),
    repositories.audit.listByJourney(id),
    repositories.decisions.listByJourney(id),
  ]);

  return NextResponse.json({
    journey,
    customer,
    events,
    audit,
    decisions,
  });
}
