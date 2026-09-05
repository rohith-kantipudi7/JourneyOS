import type { ActionType, CabinClass } from '@/types';

/**
 * Adapter ports.
 *
 * Every external system is reached through one of these interfaces, so a
 * simulated implementation and a live one are interchangeable and agents can
 * never call a real system directly.
 */

/** A concrete recovery option offered by an upstream system. */
export interface RecoveryCandidate {
  readonly id: string;
  readonly actionType: ActionType;
  readonly label: string;
  readonly summary: string;
  readonly cost: number;
  readonly currency: string;
  /** Minutes later than the original plan; negative means earlier. */
  readonly arrivalDeltaMinutes: number;
  readonly departAt: string;
  readonly arriveAt: string;
  readonly stops: number;
  readonly cabin: CabinClass;
  readonly carrier: string | null;
  readonly co2Kg: number;
  readonly seatsAvailable: number;
  /** Probability the booking sticks, 0–1 — feeds the rebooking-risk dimension. */
  readonly confirmationLikelihood: number;
  /** When this inventory was read; drives the Trust Kernel freshness check. */
  readonly fetchedAt: string;
  readonly executionParams: Readonly<Record<string, unknown>>;
}

export interface AlternativeSearch {
  readonly origin: string;
  readonly destination: string;
  readonly notBefore: string;
  readonly arriveBy: string | null;
  readonly preferredCabin: CabinClass;
  readonly passengerCount: number;
  readonly maxLayovers: number;
  readonly preferredCarriers: readonly string[];
}

export interface RebookRequest {
  readonly bookingReference: string;
  readonly candidateId: string;
  readonly flightNumber: string;
  readonly cabin: CabinClass;
  readonly passengerCount: number;
}

export interface RebookResult {
  readonly bookingReference: string;
  readonly ticketNumber: string;
  readonly flightNumber: string;
  readonly departAt: string;
  readonly arriveAt: string;
  readonly cabin: CabinClass;
  readonly provider: string;
}

/** Modelled on the Amadeus Self-Service API shapes; simulated in the MVP. */
export interface TravelAdapter {
  readonly provider: string;
  searchAlternatives(search: AlternativeSearch): Promise<RecoveryCandidate[]>;
  rebook(request: RebookRequest): Promise<RebookResult>;
  issueVoucher(input: { customerRef: string; amount: number; currency: string }): Promise<{
    voucherCode: string;
    amount: number;
    currency: string;
    expiresAt: string;
  }>;
  reserveHotel(input: { city: string; nights: number; guests: number }): Promise<{
    reservationId: string;
    propertyName: string;
    nights: number;
  }>;
}

export interface NotificationAdapter {
  readonly provider: string;
  send(input: {
    channel: string;
    to: string;
    subject: string;
    body: string;
  }): Promise<{ messageId: string; channel: string; deliveredAt: string }>;
}

export interface EscalationAdapter {
  readonly provider: string;
  escalate(input: {
    journeyRef: string;
    reason: string;
    priority: 'low' | 'normal' | 'high';
  }): Promise<{ caseId: string; queue: string; assignedTo: string | null }>;
}

/** Surfaces a customer-facing message can be delivered on. */
export const CONTENT_CHANNELS = ['email', 'push', 'in_app', 'agent'] as const;
export type ContentChannel = (typeof CONTENT_CHANNELS)[number];

/**
 * A template as authored in the CMS. Placeholders use `{{token}}` and are
 * filled deterministically — the CMS owns wording and layout, JourneyOS owns
 * the values, and neither can silently rewrite the other.
 */
export interface ContentTemplate {
  readonly uid: string;
  readonly templateKey: string;
  readonly channel: ContentChannel;
  readonly locale: string;
  readonly subject: string;
  readonly body: string;
  /** Label for the primary call to action, where the channel supports one. */
  readonly cta: string | null;
  readonly source: 'contentstack' | 'local';
}

export interface ContentAdapter {
  readonly provider: string;
  readonly live: boolean;
  loadTemplate(input: {
    templateKey: string;
    channel: ContentChannel;
    locale: string;
  }): Promise<ContentTemplate | null>;
  listTemplates(templateKey: string): Promise<ContentTemplate[]>;
}

export interface Adapters {
  readonly travel: TravelAdapter;
  readonly notification: NotificationAdapter;
  readonly escalation: EscalationAdapter;
  readonly content: ContentAdapter;
}
