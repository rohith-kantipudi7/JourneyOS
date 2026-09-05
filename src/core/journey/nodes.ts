import { toJsonObject } from '@/core/shared';
import type { Consent, ContextEdge, ContextEdgeType, ContextNode, Customer, Journey, JourneyEvent } from '@/types';

import { provenanceFor, type ContextSource } from './freshness';
import type { PriorIncidentSummary } from './prior-incidents';

/**
 * Node ids reuse the underlying entity id wherever one exists, so a node
 * clicked in the Journey Studio maps straight back to a real record.
 */
export const preferenceNodeId = (customerId: string): string => `pref_${customerId}`;
export const priorIncidentNodeId = (customerId: string): string => `pis_${customerId}`;

export function edge(type: ContextEdgeType, from: string, to: string, label: string): ContextEdge {
  return { id: `${from}->${to}:${type}`, type, from, to, label };
}

function node(
  id: string,
  type: ContextNode['type'],
  label: string,
  data: unknown,
  source: ContextSource,
  observedAt: Date,
  now: Date,
): ContextNode {
  return { id, type, label, data: toJsonObject(data), provenance: provenanceFor(source, observedAt, now) };
}

export function customerNode(customer: Customer, now: Date): ContextNode {
  return node(
    customer.id,
    'Customer',
    customer.name,
    {
      loyaltyTier: customer.loyaltyTier,
      loyaltyPoints: customer.loyaltyPoints,
      email: customer.email,
      locale: customer.preferences.locale,
    },
    'crm',
    customer.updatedAt,
    now,
  );
}

export function preferenceNode(customer: Customer, now: Date): ContextNode {
  return node(
    preferenceNodeId(customer.id),
    'Preference',
    `Prefers ${customer.preferences.priority.replace('_', ' ')}`,
    customer.preferences,
    'crm',
    customer.updatedAt,
    now,
  );
}

export function journeyNode(
  journey: Journey,
  now: Date,
  label?: string,
  source: ContextSource = 'journey_store',
): ContextNode {
  return node(
    journey.id,
    'Journey',
    label ?? journey.goal,
    {
      template: journey.template,
      status: journey.status,
      goal: journey.goal,
      startedAt: journey.startedAt.toISOString(),
      completedAt: journey.completedAt?.toISOString() ?? null,
      context: journey.context,
    },
    source,
    journey.updatedAt,
    now,
  );
}

export function eventNode(event: JourneyEvent, now: Date, source: ContextSource = 'event_store'): ContextNode {
  return node(
    event.id,
    'Event',
    `${event.type} (${event.severity})`,
    {
      type: event.type,
      severity: event.severity,
      source: event.source,
      correlationId: event.correlationId,
      occurredAt: event.occurredAt.toISOString(),
      payload: event.payload,
    },
    source,
    event.occurredAt,
    now,
  );
}

export function consentNode(consent: Consent, now: Date): ContextNode {
  return node(
    consent.id,
    'Consent',
    `${consent.channel} · ${consent.purpose} · ${consent.granted ? 'granted' : 'withheld'}`,
    {
      channel: consent.channel,
      purpose: consent.purpose,
      granted: consent.granted && consent.revokedAt === null,
      revokedAt: consent.revokedAt?.toISOString() ?? null,
      source: consent.source,
    },
    'consent_store',
    consent.capturedAt,
    now,
  );
}

export function priorIncidentNode(
  customerId: string,
  summary: PriorIncidentSummary,
  riskContribution: number,
  now: Date,
): ContextNode {
  return node(
    priorIncidentNodeId(customerId),
    'PriorIncidentSummary',
    `${summary.disruptionsLast90Days} disruption(s) in 90 days`,
    { ...summary, riskContribution },
    'derived',
    now,
    now,
  );
}
