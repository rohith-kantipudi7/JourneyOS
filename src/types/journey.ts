import type { CustomerId, JourneyId, JsonObject } from '@/core/shared';

export const JOURNEY_STATUSES = ['active', 'disrupted', 'recovering', 'completed', 'cancelled'] as const;
export type JourneyStatus = (typeof JOURNEY_STATUSES)[number];

/**
 * Journey templates ("journey packs") are what make JourneyOS reusable: the
 * platform core is domain-agnostic, and a pack supplies the domain specifics.
 * Travel is the demo pack; the others prove the runtime generalizes.
 */
export const JOURNEY_TEMPLATES = [
  'travel.disruption_recovery',
  'retail.order_recovery',
  'banking.payment_failure',
  'insurance.claim_escalation',
] as const;
export type JourneyTemplate = (typeof JOURNEY_TEMPLATES)[number];

export interface Journey {
  readonly id: JourneyId;
  readonly customerId: CustomerId;
  readonly template: JourneyTemplate;
  readonly status: JourneyStatus;
  /** Plain-language outcome the customer is trying to reach. */
  readonly goal: string;
  /** Pack-specific payload — see `TravelJourneyContext` for the travel pack. */
  readonly context: JsonObject;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type NewJourney = Omit<Journey, 'createdAt' | 'updatedAt'>;

/** Context shape used by the `travel.disruption_recovery` pack. */
export interface TravelJourneyContext extends JsonObject {
  readonly origin: string;
  readonly destination: string;
  readonly bookingReference: string;
  readonly carrier: string;
  readonly flightNumber: string;
  readonly scheduledDeparture: string;
  readonly scheduledArrival: string;
  /** Hard deadline the customer must meet, if any. Drives arrival-time scoring. */
  readonly arriveBy: string | null;
  readonly cabin: string;
  readonly passengerCount: number;
}
