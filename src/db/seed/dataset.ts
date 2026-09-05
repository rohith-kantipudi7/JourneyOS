import { ConsentIds, CustomerIds, EventIds, JourneyIds, correlationIdSchema } from '@/core/shared';
import type {
  AuditRecord,
  CabinClass,
  Consent,
  ConsentChannel,
  ConsentPurpose,
  Customer,
  EventType,
  Journey,
  JourneyEvent,
  JourneyTemplate,
  LoyaltyTier,
  OptimizationPriority,
} from '@/types';

import { generatePopulation } from './generator';
import { createRng } from './random';
import { AIRPORTS_BY_IATA, blockMinutes, distanceKm } from './reference';

/**
 * Demo dataset = scripted anchors + generated population.
 *
 * The anchors encode the demo narrative and must stay exact: each one exists to
 * make a specific governance behaviour visible. Everything else is generated
 * from the aviation reference data with a fixed seed, so the population is
 * large and realistic while remaining byte-for-byte reproducible.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Change to reshuffle the generated population; the anchors never move. */
export const SEED_VALUE = 20260301;
export const GENERATED_CUSTOMER_COUNT = 36;

export interface SeedDataset {
  readonly customers: readonly Customer[];
  readonly journeys: readonly Journey[];
  readonly consents: readonly Consent[];
  readonly events: readonly JourneyEvent[];
  readonly auditRecords: readonly AuditRecord[];
  readonly primaryJourneyId: Journey['id'];
}

interface HistorySpec {
  readonly goal: string;
  readonly origin: string;
  readonly destination: string;
  readonly carrier: string;
  readonly flightNumber: string;
  readonly startedDaysAgo: number;
  readonly disrupted: boolean;
  readonly disruptionType?: EventType;
  readonly compensationEur?: number;
  readonly compensationDaysAgo?: number;
  readonly eventDaysAgo?: number;
}

interface AnchorSpec {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly tier: LoyaltyTier;
  readonly points: number;
  readonly priority: OptimizationPriority;
  readonly cabin: CabinClass;
  readonly seat: 'window' | 'aisle' | 'no_preference';
  readonly maxLayovers: number;
  readonly airlines: readonly string[];
  readonly diet: readonly string[];
  readonly locale: string;
  readonly timezone: string;
  readonly joinedDaysAgo: number;
  /** Purpose of this anchor in the demo, kept close to the data it shapes. */
  readonly demoRole: string;
  readonly consents: ReadonlyArray<readonly [ConsentChannel, ConsentPurpose, boolean, number]>;
  readonly active: {
    readonly template: JourneyTemplate;
    readonly goal: string;
    readonly startedDaysAgo: number;
    readonly context: Record<string, unknown>;
  };
  readonly history: readonly HistorySpec[];
}

function flightContext(
  input: {
    origin: string;
    destination: string;
    carrier: string;
    flightNumber: string;
    bookingReference: string;
    cabin: CabinClass;
    passengerCount?: number;
    arriveByOffsetHours?: number | null;
  },
  now: Date,
): Record<string, unknown> {
  const from = AIRPORTS_BY_IATA.get(input.origin)!;
  const to = AIRPORTS_BY_IATA.get(input.destination)!;
  const km = distanceKm(from, to);
  const departsIn = 4 * HOUR;

  return {
    origin: input.origin,
    destination: input.destination,
    bookingReference: input.bookingReference,
    carrier: input.carrier,
    flightNumber: input.flightNumber,
    scheduledDeparture: new Date(now.getTime() + departsIn).toISOString(),
    scheduledArrival: new Date(now.getTime() + departsIn + blockMinutes(km) * 60_000).toISOString(),
    arriveBy:
      input.arriveByOffsetHours === null || input.arriveByOffsetHours === undefined
        ? null
        : new Date(now.getTime() + input.arriveByOffsetHours * HOUR).toISOString(),
    cabin: input.cabin,
    passengerCount: input.passengerCount ?? 1,
    distanceKm: km,
  };
}

function anchors(now: Date): AnchorSpec[] {
  return [
    {
      name: 'Priya Sharma',
      email: 'priya@journeyos.dev',
      phone: '+91 98450 00000',
      tier: 'gold',
      points: 84_500,
      priority: 'fastest',
      cabin: 'business',
      seat: 'window',
      maxLayovers: 1,
      airlines: ['AF', 'KL', 'AI'],
      diet: ['vegetarian'],
      locale: 'en-IN',
      timezone: 'Asia/Kolkata',
      joinedDaysAgo: 540,
      demoRole: 'Gold with two recent disruptions and a voucher inside 30 days — escalates to needs-approval.',
      consents: [
        ['email', 'service_updates', true, 540],
        ['push', 'service_updates', true, 400],
        ['in_app', 'service_updates', true, 400],
        ['email', 'automated_rebooking', true, 60],
        ['email', 'personalization', true, 60],
        ['sms', 'marketing', false, 540],
      ],
      active: {
        template: 'travel.disruption_recovery',
        goal: 'Reach Paris before the 8 PM client meeting tomorrow.',
        startedDaysAgo: 3,
        context: flightContext(
          {
            origin: 'BLR',
            destination: 'CDG',
            carrier: 'AF',
            flightNumber: 'AF191',
            bookingReference: 'JX7QK2',
            cabin: 'business',
            arriveByOffsetHours: 20,
          },
          now,
        ),
      },
      history: [
        {
          goal: 'Reach Singapore for the Q3 partner summit.',
          origin: 'BLR',
          destination: 'SIN',
          carrier: 'SQ',
          flightNumber: 'SQ509',
          startedDaysAgo: 20,
          disrupted: true,
          disruptionType: 'FlightDelayed',
          compensationEur: 120,
          compensationDaysAgo: 18,
          eventDaysAgo: 19,
        },
        {
          goal: 'Reach Delhi for the engineering offsite.',
          origin: 'BLR',
          destination: 'DEL',
          carrier: 'AI',
          flightNumber: 'AI504',
          startedDaysAgo: 55,
          disrupted: true,
          disruptionType: 'FlightCancelled',
          eventDaysAgo: 55,
        },
        {
          goal: 'Reach Dubai for a customer workshop.',
          origin: 'BLR',
          destination: 'DXB',
          carrier: 'EK',
          flightNumber: 'EK569',
          startedDaysAgo: 95,
          disrupted: false,
        },
      ],
    },

    {
      name: 'Anika Raghavan',
      email: 'anika@journeyos.dev',
      phone: '+91 99000 11111',
      tier: 'silver',
      points: 12_300,
      priority: 'cheapest',
      cabin: 'economy',
      seat: 'aisle',
      maxLayovers: 2,
      airlines: [],
      diet: [],
      locale: 'en-IN',
      timezone: 'Asia/Kolkata',
      joinedDaysAgo: 120,
      demoRole: 'Clean record but automated-rebooking consent withheld — Scenario B hard deny.',
      consents: [
        ['email', 'service_updates', true, 120],
        ['push', 'service_updates', true, 120],
        ['email', 'automated_rebooking', false, 120],
      ],
      active: {
        template: 'travel.disruption_recovery',
        goal: 'Reach Paris for a friend’s wedding.',
        startedDaysAgo: 6,
        context: flightContext(
          {
            origin: 'BLR',
            destination: 'CDG',
            carrier: 'AF',
            flightNumber: 'AF191',
            bookingReference: 'RT5HH8',
            cabin: 'economy',
            arriveByOffsetHours: null,
          },
          now,
        ),
      },
      history: [],
    },

    {
      name: 'Marcus Vogel',
      email: 'marcus@journeyos.dev',
      phone: '+49 170 2223344',
      tier: 'platinum',
      points: 412_000,
      priority: 'most_comfortable',
      cabin: 'first',
      seat: 'window',
      maxLayovers: 1,
      airlines: ['LH', 'LX'],
      diet: [],
      locale: 'de-DE',
      timezone: 'Europe/Berlin',
      joinedDaysAgo: 2200,
      demoRole: 'Heavy disruption history, but Platinum overrides the repeat-compensation guard.',
      consents: [
        ['email', 'service_updates', true, 2200],
        ['push', 'service_updates', true, 900],
        ['in_app', 'service_updates', true, 900],
        ['email', 'automated_rebooking', true, 400],
        ['email', 'personalization', true, 400],
        ['sms', 'service_updates', true, 300],
      ],
      active: {
        template: 'travel.disruption_recovery',
        goal: 'Reach Paris for the supervisory board meeting.',
        startedDaysAgo: 2,
        context: flightContext(
          {
            origin: 'FRA',
            destination: 'CDG',
            carrier: 'LH',
            flightNumber: 'LH1042',
            bookingReference: 'MV9PLT',
            cabin: 'first',
            arriveByOffsetHours: 14,
          },
          now,
        ),
      },
      history: [
        {
          goal: 'Reach New York for the annual investor day.',
          origin: 'FRA',
          destination: 'JFK',
          carrier: 'LH',
          flightNumber: 'LH400',
          startedDaysAgo: 12,
          disrupted: true,
          disruptionType: 'FlightCancelled',
          compensationEur: 600,
          compensationDaysAgo: 11,
          eventDaysAgo: 12,
        },
        {
          goal: 'Reach Zurich for a partner review.',
          origin: 'FRA',
          destination: 'ZRH',
          carrier: 'LX',
          flightNumber: 'LX1071',
          startedDaysAgo: 38,
          disrupted: true,
          disruptionType: 'FlightDelayed',
          eventDaysAgo: 38,
        },
        {
          goal: 'Reach Milan for a supplier audit.',
          origin: 'FRA',
          destination: 'MXP',
          carrier: 'LH',
          flightNumber: 'LH246',
          startedDaysAgo: 70,
          disrupted: true,
          disruptionType: 'HotelIssue',
          eventDaysAgo: 70,
        },
      ],
    },

    {
      name: 'Leila Haddad',
      email: 'leila@journeyos.dev',
      phone: '+971 50 4455667',
      tier: 'bronze',
      points: 3_100,
      priority: 'cheapest',
      cabin: 'economy',
      seat: 'no_preference',
      maxLayovers: 2,
      airlines: [],
      diet: ['halal'],
      locale: 'en-AE',
      timezone: 'Asia/Dubai',
      joinedDaysAgo: 210,
      demoRole: 'Bronze cap of €200 — cost alone pushes premium options out of policy.',
      consents: [
        ['email', 'service_updates', true, 210],
        ['in_app', 'service_updates', true, 210],
        ['email', 'automated_rebooking', true, 90],
      ],
      active: {
        template: 'travel.disruption_recovery',
        goal: 'Reach Paris to start a new job on Monday.',
        startedDaysAgo: 1,
        context: flightContext(
          {
            origin: 'DXB',
            destination: 'CDG',
            carrier: 'EK',
            flightNumber: 'EK073',
            bookingReference: 'LH2BRZ',
            cabin: 'economy',
            arriveByOffsetHours: 30,
          },
          now,
        ),
      },
      history: [],
    },

    {
      name: 'Tomás Ferreira',
      email: 'tomas@journeyos.dev',
      phone: '+351 912 334455',
      tier: 'standard',
      points: 450,
      priority: 'most_sustainable',
      cabin: 'economy',
      seat: 'aisle',
      maxLayovers: 2,
      airlines: ['KL', 'LH'],
      diet: ['vegan'],
      locale: 'fr-FR',
      timezone: 'Europe/Lisbon',
      joinedDaysAgo: 45,
      demoRole: 'Sustainability-first preference selects a different winning option.',
      consents: [
        ['email', 'service_updates', true, 45],
        ['push', 'service_updates', true, 45],
        ['email', 'automated_rebooking', true, 45],
        ['email', 'personalization', true, 45],
      ],
      active: {
        template: 'travel.disruption_recovery',
        goal: 'Reach Paris for a climate research conference.',
        startedDaysAgo: 1,
        context: flightContext(
          {
            origin: 'LIS',
            destination: 'CDG',
            carrier: 'AF',
            flightNumber: 'AF1025',
            bookingReference: 'TF7GRN',
            cabin: 'economy',
            arriveByOffsetHours: 26,
          },
          now,
        ),
      },
      history: [],
    },

    {
      name: 'Sofia Lindqvist',
      email: 'sofia@journeyos.dev',
      phone: '+46 70 998 1122',
      tier: 'platinum',
      points: 233_900,
      priority: 'cheapest',
      cabin: 'business',
      seat: 'aisle',
      maxLayovers: 1,
      airlines: ['SK'],
      diet: ['gluten_free'],
      locale: 'sv-SE',
      timezone: 'Europe/Stockholm',
      joinedDaysAgo: 1500,
      demoRole: 'Retail order journey — proves the runtime is not travel-specific.',
      consents: [
        ['email', 'service_updates', true, 1500],
        ['push', 'service_updates', true, 600],
        ['email', 'automated_rebooking', true, 200],
        ['in_app', 'service_updates', true, 200],
      ],
      active: {
        template: 'retail.order_recovery',
        goal: 'Receive the replacement laptop before the Oslo trip.',
        startedDaysAgo: 5,
        context: {
          orderId: 'ORD-90114',
          expectedDelivery: new Date(now.getTime() + 20 * HOUR).toISOString(),
          revisedDelivery: new Date(now.getTime() + 96 * HOUR).toISOString(),
          orderValue: 1840,
          currency: 'EUR',
        },
      },
      history: [
        {
          goal: 'Reach Oslo for a customer workshop.',
          origin: 'ARN',
          destination: 'OSL',
          carrier: 'SK',
          flightNumber: 'SK4412',
          startedDaysAgo: 33,
          disrupted: true,
          disruptionType: 'FlightCancelled',
          compensationEur: 250,
          compensationDaysAgo: 32,
          eventDaysAgo: 33,
        },
      ],
    },
  ];
}

export function buildSeedDataset(now: Date = new Date()): SeedDataset {
  const at = (offsetMs: number): Date => new Date(now.getTime() + offsetMs);
  const iso = (offsetMs: number): string => at(offsetMs).toISOString();

  const customers: Customer[] = [];
  const journeys: Journey[] = [];
  const consents: Consent[] = [];
  const events: JourneyEvent[] = [];

  let primaryJourneyId: Journey['id'] | undefined;

  for (const spec of anchors(now)) {
    const customerId = CustomerIds.generate();

    customers.push({
      id: customerId,
      name: spec.name,
      email: spec.email,
      phone: spec.phone,
      loyaltyTier: spec.tier,
      loyaltyPoints: spec.points,
      preferences: {
        priority: spec.priority,
        preferredCabin: spec.cabin,
        seatPreference: spec.seat,
        maxLayovers: spec.maxLayovers,
        preferredAirlines: [...spec.airlines],
        dietaryRequirements: [...spec.diet],
        locale: spec.locale,
        timezone: spec.timezone,
      },
      createdAt: at(-spec.joinedDaysAgo * DAY),
      updatedAt: at(-2 * DAY),
    });

    const activeJourneyId = JourneyIds.generate();
    primaryJourneyId ??= activeJourneyId;

    journeys.push({
      id: activeJourneyId,
      customerId,
      template: spec.active.template,
      status: 'active',
      goal: spec.active.goal,
      context: spec.active.context as Journey['context'],
      startedAt: at(-spec.active.startedDaysAgo * DAY),
      completedAt: null,
      createdAt: at(-spec.active.startedDaysAgo * DAY),
      updatedAt: at(-1 * HOUR),
    });

    for (const past of spec.history) {
      const journeyId = JourneyIds.generate();
      const from = AIRPORTS_BY_IATA.get(past.origin)!;
      const to = AIRPORTS_BY_IATA.get(past.destination)!;

      journeys.push({
        id: journeyId,
        customerId,
        template: 'travel.disruption_recovery',
        status: 'completed',
        goal: past.goal,
        context: {
          origin: past.origin,
          destination: past.destination,
          carrier: past.carrier,
          flightNumber: past.flightNumber,
          distanceKm: distanceKm(from, to),
          disrupted: past.disrupted,
          ...(past.disruptionType ? { disruptionType: past.disruptionType } : {}),
          compensationIssued:
            past.compensationEur !== undefined
              ? {
                  type: 'voucher',
                  amountEur: past.compensationEur,
                  issuedAt: iso(-(past.compensationDaysAgo ?? past.startedDaysAgo) * DAY),
                }
              : null,
        },
        startedAt: at(-past.startedDaysAgo * DAY),
        completedAt: at(-(past.startedDaysAgo - 1) * DAY),
        createdAt: at(-past.startedDaysAgo * DAY),
        updatedAt: at(-(past.startedDaysAgo - 1) * DAY),
      });

      if (past.eventDaysAgo !== undefined && past.disruptionType) {
        events.push({
          id: EventIds.generate(),
          type: past.disruptionType,
          customerId,
          journeyId,
          correlationId: correlationIdSchema.parse(`anchor-${past.flightNumber}-${past.eventDaysAgo}`),
          severity: past.disruptionType === 'FlightCancelled' ? 'high' : 'medium',
          source: 'seed.history',
          payload: { flightNumber: past.flightNumber, carrier: past.carrier, reason: 'operational' },
          occurredAt: at(-past.eventDaysAgo * DAY),
          receivedAt: at(-past.eventDaysAgo * DAY),
        });
      }
    }

    for (const [channel, purpose, granted, capturedDaysAgo] of spec.consents) {
      consents.push({
        id: ConsentIds.generate(),
        customerId,
        channel,
        purpose,
        granted,
        source: 'traveler_app_preferences',
        capturedAt: at(-capturedDaysAgo * DAY),
        revokedAt: null,
      });
    }
  }

  const generated = generatePopulation({
    count: GENERATED_CUSTOMER_COUNT,
    now,
    rng: createRng(SEED_VALUE),
    reservedEmails: new Set(customers.map((customer) => customer.email)),
  });

  return {
    customers: [...customers, ...generated.customers],
    journeys: [...journeys, ...generated.journeys],
    consents: [...consents, ...generated.consents],
    events: [...events, ...generated.events],
    auditRecords: generated.auditRecords,
    primaryJourneyId: primaryJourneyId!,
  };
}
