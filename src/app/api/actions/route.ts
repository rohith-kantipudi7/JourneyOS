import { NextResponse } from 'next/server';

import { DecisionIds } from '@/core/shared';
import { ACTION_ACTORS } from '@/types';
import type { ActionActor } from '@/types';
import { getContainer } from '@/services';

import { readJsonBody } from '../_lib/responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS: Record<string, number> = {
  decision_not_found: 404,
  option_not_found: 404,
  not_approved: 403,
  trust_denied: 403,
  execution_failed: 500,
};

/** Stages 6–8: record approval, re-check trust, execute, audit. */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await readJsonBody(request)) as Record<string, unknown> | undefined;
  const decisionId = body?.decisionId;
  const optionId = body?.optionId;
  const approvedBy = (body?.approvedBy as ActionActor) ?? 'customer';

  if (typeof decisionId !== 'string' || !DecisionIds.is(decisionId)) {
    return NextResponse.json(
      {
        error: {
          code: 'validation_failed',
          message: 'A valid decisionId is required.',
          fieldErrors: { decisionId: ['Expected a DecisionId of the form `dec_<32 hex chars>`'] },
        },
      },
      { status: 400 },
    );
  }

  if (!ACTION_ACTORS.includes(approvedBy)) {
    return NextResponse.json(
      {
        error: {
          code: 'validation_failed',
          message: 'Unknown approver.',
          fieldErrors: { approvedBy: [`Expected one of: ${ACTION_ACTORS.join(', ')}`] },
        },
      },
      { status: 400 },
    );
  }

  const result = await getContainer().actions.approveAndExecute({
    decisionId,
    ...(typeof optionId === 'string' ? { optionId } : {}),
    approvedBy,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: { code: result.error.code, message: result.error.message } },
      { status: STATUS[result.error.code] ?? 500 },
    );
  }

  const { action, replayed } = result.value;

  return NextResponse.json(
    {
      actionId: action.id,
      decisionId: action.decisionId,
      journeyId: action.journeyId,
      type: action.type,
      status: action.status,
      idempotencyKey: action.idempotencyKey,
      result: action.result,
      failureReason: action.failureReason,
      approvedBy: action.approvedBy,
      executedAt: action.executedAt,
      replayed,
    },
    // 200 on replay: nothing new was executed.
    { status: replayed ? 200 : 201 },
  );
}
