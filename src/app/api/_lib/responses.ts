import { NextResponse } from 'next/server';

import type { IngestErrorCode, IngestFailure, IngestOutcome } from '@/events';

/** Maps a domain failure onto the HTTP status that actually describes it. */
const STATUS_BY_CODE: Record<IngestErrorCode, number> = {
  validation_failed: 400,
  customer_not_found: 404,
  journey_not_found: 404,
  journey_ownership_mismatch: 409,
  journey_required: 422,
};

export function ingestFailureResponse(failure: IngestFailure): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: failure.code,
        message: failure.message,
        ...(failure.fieldErrors ? { fieldErrors: failure.fieldErrors } : {}),
      },
    },
    { status: STATUS_BY_CODE[failure.code] },
  );
}

export function ingestSuccessResponse(outcome: IngestOutcome): NextResponse {
  return NextResponse.json(
    {
      eventId: outcome.event.id,
      journeyId: outcome.journey.id,
      journeyStatus: outcome.journey.status,
      type: outcome.event.type,
      severity: outcome.severity,
      duplicate: outcome.duplicate,
      journeyCreated: outcome.journeyCreated,
      journeyStatusChanged: outcome.journeyStatusChanged,
      correlationId: outcome.event.correlationId,
    },
    // 200 rather than 201 on replay: nothing new was created.
    { status: outcome.duplicate ? 200 : 201 },
  );
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
