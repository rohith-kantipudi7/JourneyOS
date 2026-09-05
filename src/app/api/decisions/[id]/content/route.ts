import { NextResponse } from 'next/server';

import { DecisionIds } from '@/core/shared';
import { getContainer } from '@/services';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS: Record<string, number> = {
  decision_not_found: 404,
  journey_not_found: 404,
  no_templates: 422,
};

/** Renders one decision across every consented channel. */
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

  const result = await getContainer().content.compose({ decisionId: id });

  return result.ok
    ? NextResponse.json(result.value)
    : NextResponse.json({ error: result.error }, { status: STATUS[result.error.code] ?? 500 });
}
