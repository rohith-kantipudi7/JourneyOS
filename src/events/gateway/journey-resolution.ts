import { toJsonObject, type JsonObject } from '@/core/shared';
import type { EventType, JourneyStatus, JourneyTemplate } from '@/types';

import type { InboundEvent } from '../schemas';

/** Journeys in these states can still absorb a new event. */
export const OPEN_JOURNEY_STATUSES: readonly JourneyStatus[] = ['active', 'disrupted', 'recovering'];

/**
 * Which journey pack an event belongs to.
 *
 * `CustomerComplaint` maps to `null` deliberately: a complaint is always
 * *about* something, so it must attach to an existing journey rather than
 * inventing one with no context.
 */
export function templateForEventType(type: EventType): JourneyTemplate | null {
  switch (type) {
    case 'FlightCancelled':
    case 'FlightDelayed':
    case 'GateChanged':
    case 'HotelIssue':
      return 'travel.disruption_recovery';
    case 'OrderDelayed':
      return 'retail.order_recovery';
    case 'CustomerComplaint':
      return null;
  }
}

export interface JourneyDraft {
  readonly template: JourneyTemplate;
  readonly goal: string;
  readonly context: JsonObject;
}

/** Seeds a new journey from the event that triggered it. */
export function buildJourneyDraft(event: InboundEvent): JourneyDraft | null {
  const template = templateForEventType(event.type);
  if (!template) return null;

  switch (event.type) {
    case 'FlightCancelled':
      return {
        template,
        goal: `Reach ${event.payload.destination} after ${event.payload.flightNumber} was cancelled.`,
        context: toJsonObject({
          origin: event.payload.origin,
          destination: event.payload.destination,
          bookingReference: event.payload.bookingReference,
          carrier: event.payload.carrier,
          flightNumber: event.payload.flightNumber,
          scheduledDeparture: event.payload.scheduledDeparture,
          arriveBy: event.payload.rebookingDeadline ?? null,
          passengerCount: event.payload.passengerCount,
        }),
      };

    case 'FlightDelayed':
      return {
        template,
        goal: `Protect the arrival plan after ${event.payload.flightNumber} was delayed by ${event.payload.delayMinutes} minutes.`,
        context: toJsonObject({
          bookingReference: event.payload.bookingReference,
          carrier: event.payload.carrier,
          flightNumber: event.payload.flightNumber,
          revisedDeparture: event.payload.revisedDeparture,
          delayMinutes: event.payload.delayMinutes,
        }),
      };

    case 'GateChanged':
      return {
        template,
        goal: `Board ${event.payload.flightNumber} at the reassigned gate ${event.payload.newGate}.`,
        context: toJsonObject({
          bookingReference: event.payload.bookingReference,
          flightNumber: event.payload.flightNumber,
          gate: event.payload.newGate,
          boardingAt: event.payload.boardingAt,
        }),
      };

    case 'HotelIssue':
      return {
        template,
        goal: `Secure accommodation after an issue at ${event.payload.propertyName}.`,
        context: toJsonObject({
          reservationId: event.payload.reservationId,
          propertyName: event.payload.propertyName,
          checkInDate: event.payload.checkInDate,
          nights: event.payload.nights,
        }),
      };

    case 'OrderDelayed':
      return {
        template,
        goal: `Recover the delivery commitment for order ${event.payload.orderId}.`,
        context: toJsonObject({
          orderId: event.payload.orderId,
          expectedDelivery: event.payload.expectedDelivery,
          revisedDelivery: event.payload.revisedDelivery,
          orderValue: event.payload.orderValue,
          currency: event.payload.currency,
        }),
      };

    case 'CustomerComplaint':
      return null;
  }
}
