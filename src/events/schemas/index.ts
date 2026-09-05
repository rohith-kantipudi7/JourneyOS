import { z } from 'zod';

import type { EventType } from '@/types';

import {
  customerComplaintSchema,
  flightCancelledSchema,
  flightDelayedSchema,
  gateChangedSchema,
  hotelIssueSchema,
  orderDelayedSchema,
} from './event-types';

export * from './common';
export * from './event-types';

/** Lookup by type — used by the simulator and by validation error reporting. */
export const EVENT_SCHEMAS = {
  FlightCancelled: flightCancelledSchema,
  FlightDelayed: flightDelayedSchema,
  GateChanged: gateChangedSchema,
  HotelIssue: hotelIssueSchema,
  OrderDelayed: orderDelayedSchema,
  CustomerComplaint: customerComplaintSchema,
} as const satisfies Record<EventType, z.ZodTypeAny>;

/**
 * The single entry point for inbound event validation. Discriminating on
 * `type` means an unknown type fails fast with a clear message instead of
 * silently matching a loose shape.
 */
export const inboundEventSchema = z.discriminatedUnion('type', [
  flightCancelledSchema,
  flightDelayedSchema,
  gateChangedSchema,
  hotelIssueSchema,
  orderDelayedSchema,
  customerComplaintSchema,
]);

export type InboundEvent = z.infer<typeof inboundEventSchema>;
export type InboundEventOf<T extends EventType> = Extract<InboundEvent, { type: T }>;
