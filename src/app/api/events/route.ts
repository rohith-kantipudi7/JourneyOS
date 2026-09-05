import { NextResponse } from 'next/server';

import { getContainer } from '@/services';

import { ingestFailureResponse, ingestSuccessResponse, readJsonBody } from '../_lib/responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Stage 1 of the control loop: ingest a business event. */
export async function POST(request: Request): Promise<NextResponse> {
  const body = await readJsonBody(request);

  if (body === undefined) {
    return NextResponse.json(
      { error: { code: 'validation_failed', message: 'Request body must be valid JSON.' } },
      { status: 400 },
    );
  }

  const result = await getContainer().eventGateway.ingest(body);

  return result.ok ? ingestSuccessResponse(result.value) : ingestFailureResponse(result.error);
}
