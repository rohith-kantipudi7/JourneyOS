import { NextResponse } from 'next/server';

import { buildTradeoffTable } from '@/core/decision';
import { DecisionIds } from '@/core/shared';
import { getContainer } from '@/services';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Loads a previously produced decision, so the console can show it without re-planning. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  if (!DecisionIds.is(id)) {
    return NextResponse.json(
      { error: { code: 'validation_failed', message: 'Expected a DecisionId.' } },
      { status: 400 },
    );
  }

  const decision = await getContainer().repositories.decisions.findById(id);
  if (!decision) {
    return NextResponse.json(
      { error: { code: 'decision_not_found', message: `No decision with id ${id}.` } },
      { status: 404 },
    );
  }

  return NextResponse.json({
    decisionId: decision.id,
    journeyId: decision.journeyId,
    snapshotId: decision.snapshotId,
    status: decision.status,
    planner: decision.planner,
    model: decision.model,
    promptVersion: decision.promptVersion,
    confidence: decision.confidence,
    reasoning: decision.reasoning,
    evidence: decision.evidence,
    weights: decision.weights,
    bestOption: decision.bestOption,
    alternatives: decision.alternatives,
    tradeoff: buildTradeoffTable(decision.bestOption, decision.alternatives, decision.weights),
    screenedOut: [],
    trust: decision.trust,
  });
}
