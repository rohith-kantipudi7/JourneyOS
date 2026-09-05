import { NextResponse } from 'next/server';

import { CustomerIds, JourneyIds } from '@/core/shared';
import { SCENARIOS, SIMULATOR_SCENARIOS, listScenarios } from '@/events';
import { getContainer } from '@/services';

import { ingestFailureResponse, ingestSuccessResponse, readJsonBody } from '../../_lib/responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Scenario catalogue for the demo control panel. */
export async function GET(): Promise<NextResponse> {
  const { repositories } = getContainer();
  const customers = await repositories.customers.list();

  return NextResponse.json({
    scenarios: listScenarios().map(({ id, label, description, eventType, expectedSeverity }) => ({
      id,
      label,
      description,
      eventType,
      expectedSeverity,
    })),
    customers: customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      loyaltyTier: customer.loyaltyTier,
    })),
  });
}

/**
 * Builds a realistic event for a named scenario and pushes it through the same
 * gateway as external traffic — the simulator never bypasses validation.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = await readJsonBody(request);

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json(
      { error: { code: 'validation_failed', message: 'Request body must be a JSON object.' } },
      { status: 400 },
    );
  }

  const { scenario, customerId, journeyId, correlationId } = body as Record<string, unknown>;

  if (typeof scenario !== 'string' || !SIMULATOR_SCENARIOS.includes(scenario as never)) {
    return NextResponse.json(
      {
        error: {
          code: 'validation_failed',
          message: 'Unknown scenario.',
          fieldErrors: { scenario: [`Expected one of: ${SIMULATOR_SCENARIOS.join(', ')}`] },
        },
      },
      { status: 400 },
    );
  }

  if (typeof customerId !== 'string' || !CustomerIds.is(customerId)) {
    return NextResponse.json(
      {
        error: {
          code: 'validation_failed',
          message: 'A valid customerId is required.',
          fieldErrors: { customerId: ['Expected a CustomerId of the form `cus_<32 hex chars>`'] },
        },
      },
      { status: 400 },
    );
  }

  const definition = SCENARIOS[scenario as keyof typeof SCENARIOS];
  const event = definition.build({
    customerId,
    journeyId: typeof journeyId === 'string' && JourneyIds.is(journeyId) ? journeyId : null,
    ...(typeof correlationId === 'string' ? { correlationId } : {}),
  });

  const result = await getContainer().eventGateway.ingest(event);

  return result.ok ? ingestSuccessResponse(result.value) : ingestFailureResponse(result.error);
}
