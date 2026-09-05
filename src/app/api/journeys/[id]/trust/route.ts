import { NextResponse } from 'next/server';

import { buildTrustContext } from '@/core/trust';
import { JourneyIds } from '@/core/shared';
import { ACTION_TYPES } from '@/types';
import type { ActionType, ConsentChannel } from '@/types';
import { getContainer } from '@/services';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Evaluates the Trust Kernel against a journey's current context for a
 * hypothetical action — the "what would happen if we tried this?" view.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  if (!JourneyIds.is(id)) {
    return NextResponse.json(
      { error: { code: 'validation_failed', message: 'Expected a JourneyId.' } },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  const action = url.searchParams.get('action') ?? 'issueVoucher';
  const cost = Number(url.searchParams.get('cost') ?? '120');
  const channel = url.searchParams.get('channel') ?? undefined;

  if (!ACTION_TYPES.includes(action as ActionType)) {
    return NextResponse.json(
      {
        error: {
          code: 'validation_failed',
          message: 'Unknown action type.',
          fieldErrors: { action: [`Expected one of: ${ACTION_TYPES.join(', ')}`] },
        },
      },
      { status: 400 },
    );
  }

  const { repositories, contextBuilder, trustKernel } = getContainer();

  const events = await repositories.events.listByJourney(id);
  const latestEvent = events.at(-1);
  if (!latestEvent) {
    return NextResponse.json(
      { error: { code: 'no_events', message: 'This journey has no events yet.' } },
      { status: 422 },
    );
  }

  const built = await contextBuilder.build({ journeyId: id, eventId: latestEvent.id });
  if (!built.ok) {
    return NextResponse.json({ error: built.error }, { status: 422 });
  }

  const trustContext = buildTrustContext(built.value, {
    type: action as ActionType,
    estimatedCost: Number.isFinite(cost) ? cost : 0,
    currency: 'EUR',
    ...(channel ? { channel: channel as ConsentChannel } : {}),
  });

  const decision = trustKernel.evaluate(trustContext);

  return NextResponse.json({
    journeyId: id,
    snapshotId: built.value.id,
    action: trustContext.action,
    outcome: decision.outcome,
    headline: decision.headline,
    riskScore: decision.riskScore,
    riskFactors: decision.riskFactors,
    checks: decision.checks,
    failedRuleIds: decision.failedRuleIds,
    policyVersion: decision.policyVersion,
    evaluatedAt: decision.evaluatedAt,
  });
}
