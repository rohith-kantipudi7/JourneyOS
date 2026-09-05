import { newCorrelationId, type CustomerId, type JourneyId } from '@/core/shared';
import type { EventType } from '@/types';

export const SIMULATOR_SCENARIOS = [
  'flight_cancelled',
  'flight_delayed_major',
  'flight_delayed_minor',
  'gate_changed',
  'hotel_overbooked',
  'order_delayed',
  'angry_complaint',
] as const;
export type SimulatorScenario = (typeof SIMULATOR_SCENARIOS)[number];

export interface ScenarioInput {
  readonly customerId: CustomerId;
  readonly journeyId?: JourneyId | null;
  readonly correlationId?: string;
  readonly now?: Date;
}

export interface ScenarioDefinition {
  readonly id: SimulatorScenario;
  readonly label: string;
  readonly description: string;
  readonly eventType: EventType;
  readonly expectedSeverity: string;
  /** Returns an *unvalidated* envelope so the simulator uses the same gate as external callers. */
  build(input: ScenarioInput): Record<string, unknown>;
}

const HOUR = 60 * 60 * 1000;

function envelope(input: ScenarioInput, type: EventType, payload: Record<string, unknown>) {
  const now = input.now ?? new Date();
  return {
    type,
    customerId: input.customerId,
    journeyId: input.journeyId ?? null,
    correlationId: input.correlationId ?? newCorrelationId(),
    source: 'journeyos.simulator',
    occurredAt: now.toISOString(),
    payload,
  };
}

export const SCENARIOS: Record<SimulatorScenario, ScenarioDefinition> = {
  flight_cancelled: {
    id: 'flight_cancelled',
    label: 'Flight cancelled (BLR → CDG)',
    description: 'The flagship scenario: a long-haul cancellation with a hard arrival deadline.',
    eventType: 'FlightCancelled',
    expectedSeverity: 'high',
    build: (input) => {
      const now = input.now ?? new Date();
      return envelope(input, 'FlightCancelled', {
        bookingReference: 'JX7QK2',
        carrier: 'AF',
        flightNumber: 'AF191',
        origin: 'BLR',
        destination: 'CDG',
        scheduledDeparture: new Date(now.getTime() + 4 * HOUR).toISOString(),
        reason: 'technical',
        rebookingDeadline: new Date(now.getTime() + 20 * HOUR).toISOString(),
        passengerCount: 1,
      });
    },
  },

  flight_delayed_major: {
    id: 'flight_delayed_major',
    label: 'Flight delayed 5 hours',
    description: 'Delay long enough to derive high severity and disrupt the journey.',
    eventType: 'FlightDelayed',
    expectedSeverity: 'high',
    build: (input) => {
      const now = input.now ?? new Date();
      return envelope(input, 'FlightDelayed', {
        bookingReference: 'JX7QK2',
        carrier: 'AF',
        flightNumber: 'AF191',
        delayMinutes: 300,
        revisedDeparture: new Date(now.getTime() + 9 * HOUR).toISOString(),
        reason: 'late_inbound',
      });
    },
  },

  flight_delayed_minor: {
    id: 'flight_delayed_minor',
    label: 'Flight delayed 35 minutes',
    description: 'Contrast case: the same event type derives low severity and leaves status untouched.',
    eventType: 'FlightDelayed',
    expectedSeverity: 'low',
    build: (input) => {
      const now = input.now ?? new Date();
      return envelope(input, 'FlightDelayed', {
        bookingReference: 'JX7QK2',
        carrier: 'AF',
        flightNumber: 'AF191',
        delayMinutes: 35,
        revisedDeparture: new Date(now.getTime() + 5 * HOUR).toISOString(),
        reason: 'atc',
      });
    },
  },

  gate_changed: {
    id: 'gate_changed',
    label: 'Gate changed (terminal move)',
    description: 'Informational event that still matters when the terminal changes.',
    eventType: 'GateChanged',
    expectedSeverity: 'medium',
    build: (input) => {
      const now = input.now ?? new Date();
      return envelope(input, 'GateChanged', {
        bookingReference: 'JX7QK2',
        flightNumber: 'AF191',
        previousGate: 'B12',
        newGate: 'D04',
        boardingAt: new Date(now.getTime() + 3 * HOUR).toISOString(),
        terminalChanged: true,
      });
    },
  },

  hotel_overbooked: {
    id: 'hotel_overbooked',
    label: 'Hotel overbooked',
    description: 'Downstream disruption affecting the same journey.',
    eventType: 'HotelIssue',
    expectedSeverity: 'high',
    build: (input) => {
      const now = input.now ?? new Date();
      return envelope(input, 'HotelIssue', {
        reservationId: 'HTL-88213',
        propertyName: 'Hôtel Odéon Saint-Germain',
        issueType: 'overbooked',
        checkInDate: new Date(now.getTime() + 16 * HOUR).toISOString(),
        nights: 2,
      });
    },
  },

  order_delayed: {
    id: 'order_delayed',
    label: 'Retail order delayed',
    description: 'Proves the runtime is not travel-specific — a different journey pack entirely.',
    eventType: 'OrderDelayed',
    expectedSeverity: 'high',
    build: (input) => {
      const now = input.now ?? new Date();
      return envelope(input, 'OrderDelayed', {
        orderId: 'ORD-55021',
        expectedDelivery: new Date(now.getTime() + 24 * HOUR).toISOString(),
        revisedDelivery: new Date(now.getTime() + 96 * HOUR).toISOString(),
        reason: 'stock_shortage',
        orderValue: 780,
        currency: 'EUR',
      });
    },
  },

  angry_complaint: {
    id: 'angry_complaint',
    label: 'Escalating customer complaint',
    description: 'Attaches to an existing journey; never creates one.',
    eventType: 'CustomerComplaint',
    expectedSeverity: 'high',
    build: (input) =>
      envelope(input, 'CustomerComplaint', {
        channel: 'chat',
        subject: 'Still no rebooking option',
        message: 'I have been waiting two hours and nobody has offered me an alternative flight.',
        sentiment: 'angry',
        escalationRequested: true,
      }),
  },
};

export function listScenarios(): ScenarioDefinition[] {
  return SIMULATOR_SCENARIOS.map((id) => SCENARIOS[id]);
}
