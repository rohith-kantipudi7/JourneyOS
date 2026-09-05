import { NextResponse } from 'next/server';

import { JourneyIds } from '@/core/shared';
import { getContainer } from '@/services';

import { readJsonBody } from '../_lib/responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS: Record<string, number> = {
  journey_not_found: 404,
  no_events: 422,
  context_build_failed: 422,
  no_viable_options: 409,
};

/** Stages 4–5: Sense → screen → Plan → rank → Trust pre-check. */
export async function POST(request: Request): Promise<NextResponse> {
  const body = await readJsonBody(request);
  const journeyId = (body as { journeyId?: unknown } | undefined)?.journeyId;

  if (typeof journeyId !== 'string' || !JourneyIds.is(journeyId)) {
    return NextResponse.json(
      {
        error: {
          code: 'validation_failed',
          message: 'A valid journeyId is required.',
          fieldErrors: { journeyId: ['Expected a JourneyId of the form `jrn_<32 hex chars>`'] },
        },
      },
      { status: 400 },
    );
  }

  const result = await getContainer().decisions.plan({ journeyId });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: {
          code: result.error.code,
          message: result.error.message,
          ...(result.error.screenedOut ? { screenedOut: result.error.screenedOut } : {}),
        },
      },
      { status: STATUS[result.error.code] ?? 500 },
    );
  }

  const { decision, tradeoff, screenedOut } = result.value;

  return NextResponse.json(
    {
      decisionId: decision.id,
      journeyId: decision.journeyId,
      snapshotId: decision.snapshotId,
      planner: decision.planner,
      model: decision.model,
      promptVersion: decision.promptVersion,
      confidence: decision.confidence,
      reasoning: decision.reasoning,
      evidence: decision.evidence,
      weights: decision.weights,
      bestOption: decision.bestOption,
      alternatives: decision.alternatives,
      tradeoff,
      screenedOut,
      trust: decision.trust,
    },
    { status: 201 },
  );
}
