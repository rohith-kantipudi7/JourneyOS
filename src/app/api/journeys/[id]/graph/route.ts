import { NextResponse } from 'next/server';

import { maxDepthFrom, traverse } from '@/core/journey';
import { JourneyIds } from '@/core/shared';
import { getContainer } from '@/services';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS_BY_CODE: Record<string, number> = {
  journey_not_found: 404,
  event_not_found: 404,
  customer_not_found: 404,
  event_journey_mismatch: 409,
  snapshot_invalid: 500,
};

/**
 * Returns the context graph for a journey.
 *
 * `?from=<nodeId>&depth=<n>` returns only the N-hop neighbourhood of a node,
 * which is what the Journey Studio uses to explain a single decision.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  if (!JourneyIds.is(id)) {
    return NextResponse.json(
      { error: { code: 'validation_failed', message: 'Expected a JourneyId of the form `jrn_<32 hex chars>`.' } },
      { status: 400 },
    );
  }

  const { repositories, contextBuilder } = getContainer();

  const events = await repositories.events.listByJourney(id);
  const latestEvent = events.at(-1);

  if (!latestEvent) {
    const journey = await repositories.journeys.findById(id);
    return NextResponse.json(
      {
        error: {
          code: journey ? 'no_events' : 'journey_not_found',
          message: journey
            ? 'This journey has no events yet, so there is no context to build.'
            : `No journey exists with id ${id}.`,
        },
      },
      { status: journey ? 422 : 404 },
    );
  }

  const built = await contextBuilder.build({ journeyId: id, eventId: latestEvent.id });

  if (!built.ok) {
    return NextResponse.json(
      { error: { code: built.error.code, message: built.error.message } },
      { status: STATUS_BY_CODE[built.error.code] ?? 500 },
    );
  }

  const snapshot = built.value;
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const depthParam = Number(url.searchParams.get('depth'));
  const depth = Number.isFinite(depthParam) && depthParam > 0 ? Math.floor(depthParam) : undefined;

  const view = from && depth ? traverse(snapshot, from, depth) : undefined;

  return NextResponse.json({
    snapshotId: snapshot.id,
    journeyId: snapshot.journeyId,
    customerId: snapshot.customerId,
    eventId: snapshot.eventId,
    stale: snapshot.stale,
    // Staleness is targeted, not blanket: name the inputs that aged out.
    staleNodes: snapshot.nodes
      .filter((node) => node.provenance.stale)
      .map((node) => ({ id: node.id, type: node.type, label: node.label, ageSeconds: node.provenance.ageSeconds })),
    builtAt: snapshot.builtAt,
    nodes: view?.nodes ?? snapshot.nodes,
    edges: view?.edges ?? snapshot.edges,
    stats: {
      nodeCount: (view?.nodes ?? snapshot.nodes).length,
      edgeCount: (view?.edges ?? snapshot.edges).length,
      maxDepthFromJourney: maxDepthFrom(snapshot, snapshot.journeyId),
      ...(view ? { traversedFrom: from, depth } : {}),
    },
  });
}
