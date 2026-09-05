import type { CorrelationId, CustomerId, EventId, JourneyId, JsonObject } from '@/core/shared';

/**
 * Named `JourneyEvent` rather than `Event` so it never collides with the DOM
 * `Event` global in client components.
 */

export const EVENT_TYPES = [
  'FlightCancelled',
  'FlightDelayed',
  'GateChanged',
  'HotelIssue',
  'OrderDelayed',
  'CustomerComplaint',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'] as const;
export type EventSeverity = (typeof EVENT_SEVERITIES)[number];

export interface JourneyEvent {
  readonly id: EventId;
  readonly type: EventType;
  readonly customerId: CustomerId;
  /** Null until the Event Gateway attaches the event to a journey. */
  readonly journeyId: JourneyId | null;
  /** Unique per logical event — the basis for idempotent ingestion. */
  readonly correlationId: CorrelationId;
  readonly severity: EventSeverity;
  /** Upstream system that emitted the event, recorded for provenance. */
  readonly source: string;
  readonly payload: JsonObject;
  /** When the event happened upstream. */
  readonly occurredAt: Date;
  /** When JourneyOS received it — the gap feeds the freshness check. */
  readonly receivedAt: Date;
}

export type NewJourneyEvent = Omit<JourneyEvent, 'receivedAt'>;
