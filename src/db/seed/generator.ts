import { AuditRecordIds, ConsentIds, CustomerIds, EventIds, JourneyIds, correlationIdSchema } from '@/core/shared';
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
  LoyaltyTier,
  OptimizationPriority,
} from '@/types';

import type { Rng } from './random';
import { AIRLINES, AIRPORTS, AIRPORTS_BY_IATA, blockMinutes, distanceKm } from './reference';

/**
 * Synthetic population generator.
 *
 * Builds a realistic traveller base from the aviation reference data: real
 * airports and carriers, distance-derived timings, and a loyalty distribution
 * shaped like an actual programme (many at the bottom, few at the top).
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface NameLocale {
  readonly locale: string;
  readonly timezone: string;
  readonly homeAirports: readonly string[];
  readonly given: readonly string[];
  readonly family: readonly string[];
}

const LOCALES: readonly NameLocale[] = [
  {
    locale: 'en-IN',
    timezone: 'Asia/Kolkata',
    homeAirports: ['BLR', 'BOM', 'DEL', 'MAA', 'HYD'],
    given: ['Aarav', 'Ananya', 'Divya', 'Ishaan', 'Kavya', 'Meera', 'Nikhil', 'Rahul', 'Sanjay', 'Tara'],
    family: ['Iyer', 'Kapoor', 'Menon', 'Nair', 'Patel', 'Reddy', 'Sharma', 'Verma'],
  },
  {
    locale: 'de-DE',
    timezone: 'Europe/Berlin',
    homeAirports: ['FRA', 'MUC', 'VIE', 'ZRH'],
    given: ['Anna', 'Felix', 'Greta', 'Jonas', 'Klara', 'Lukas', 'Mia', 'Niklas'],
    family: ['Bauer', 'Fischer', 'Hoffmann', 'Keller', 'Richter', 'Schneider', 'Vogel', 'Weber'],
  },
  {
    locale: 'fr-FR',
    timezone: 'Europe/Paris',
    homeAirports: ['CDG', 'BRU', 'LIS', 'MAD'],
    given: ['Amélie', 'Camille', 'Élodie', 'Hugo', 'Julien', 'Léa', 'Mathieu', 'Sylvie'],
    family: ['Bernard', 'Dubois', 'Garnier', 'Laurent', 'Moreau', 'Petit', 'Rousseau'],
  },
  {
    locale: 'en-GB',
    timezone: 'Europe/London',
    homeAirports: ['LHR', 'DUB'],
    given: ['Alice', 'Callum', 'Eleanor', 'George', 'Imogen', 'Oliver', 'Priya', 'Thomas'],
    family: ['Bennett', 'Clarke', 'Ellis', 'Harper', 'Morgan', 'Okafor', 'Shah', 'Whitfield'],
  },
  {
    locale: 'ja-JP',
    timezone: 'Asia/Tokyo',
    homeAirports: ['HND', 'ICN', 'HKG', 'SIN'],
    given: ['Aiko', 'Daichi', 'Haruto', 'Kenji', 'Mei', 'Riko', 'Sota', 'Yuki'],
    family: ['Fujimoto', 'Ito', 'Kobayashi', 'Nakamura', 'Sato', 'Tanaka', 'Watanabe'],
  },
  {
    locale: 'sv-SE',
    timezone: 'Europe/Stockholm',
    homeAirports: ['ARN', 'CPH', 'OSL', 'HEL'],
    given: ['Astrid', 'Björn', 'Elsa', 'Erik', 'Ingrid', 'Lars', 'Sofia', 'Nils'],
    family: ['Andersson', 'Berg', 'Lindqvist', 'Nilsson', 'Olsen', 'Sandberg', 'Virtanen'],
  },
  {
    locale: 'en-AE',
    timezone: 'Asia/Dubai',
    homeAirports: ['DXB', 'AUH', 'DOH'],
    given: ['Amina', 'Fatima', 'Hassan', 'Khalid', 'Layla', 'Omar', 'Rania', 'Yusuf'],
    family: ['Al-Farsi', 'Haddad', 'Karim', 'Mansour', 'Nasser', 'Rahman', 'Saleh'],
  },
];

/** Shaped like a real loyalty programme: a wide base, a narrow top. */
const TIER_DISTRIBUTION: ReadonlyArray<readonly [LoyaltyTier, number]> = [
  ['standard', 34],
  ['bronze', 27],
  ['silver', 20],
  ['gold', 13],
  ['platinum', 6],
];

const TIER_POINTS: Readonly<Record<LoyaltyTier, readonly [number, number]>> = {
  standard: [0, 2_500],
  bronze: [2_500, 15_000],
  silver: [15_000, 45_000],
  gold: [45_000, 140_000],
  platinum: [140_000, 480_000],
};

const TIER_CABIN: Readonly<Record<LoyaltyTier, readonly CabinClass[]>> = {
  standard: ['economy'],
  bronze: ['economy'],
  silver: ['economy', 'premium_economy'],
  gold: ['premium_economy', 'business'],
  platinum: ['business', 'first'],
};

const PRIORITIES: ReadonlyArray<readonly [OptimizationPriority, number]> = [
  ['fastest', 34],
  ['cheapest', 33],
  ['most_comfortable', 18],
  ['most_sustainable', 15],
];

const DISRUPTION_TYPES: readonly EventType[] = [
  'FlightCancelled',
  'FlightDelayed',
  'HotelIssue',
  'GateChanged',
];

const TRIP_PURPOSES = [
  'a client meeting',
  'a partner summit',
  'a design review',
  'a family wedding',
  'a research conference',
  'a supplier audit',
  'a product launch',
  'a board meeting',
  'a university reunion',
  'a holiday',
];

export interface GeneratedPopulation {
  readonly customers: Customer[];
  readonly journeys: Journey[];
  readonly consents: Consent[];
  readonly events: JourneyEvent[];
  readonly auditRecords: AuditRecord[];
}

interface GenerateOptions {
  readonly count: number;
  readonly now: Date;
  readonly rng: Rng;
  /** Emails already taken by the hand-authored demo anchors. */
  readonly reservedEmails: ReadonlySet<string>;
  /** Share of the population already mid-disruption, so the console opens with real activity. */
  readonly liveDisruptionRate?: number;
}

function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

export function generatePopulation(options: GenerateOptions): GeneratedPopulation {
  const { count, now, rng, reservedEmails } = options;
  const liveDisruptionRate = options.liveDisruptionRate ?? 0.72;
  const at = (offsetMs: number): Date => new Date(now.getTime() + offsetMs);

  const customers: Customer[] = [];
  const journeys: Journey[] = [];
  const consents: Consent[] = [];
  const events: JourneyEvent[] = [];
  const auditRecords: AuditRecord[] = [];
  const usedEmails = new Set(reservedEmails);

  for (let index = 0; index < count; index++) {
    const locale = rng.pick(LOCALES);
    const given = rng.pick(locale.given);
    const family = rng.pick(locale.family);
    const name = `${given} ${family}`;

    let email = `${slug(given)}.${slug(family)}@journeyos.dev`;
    let suffix = 2;
    while (usedEmails.has(email)) {
      email = `${slug(given)}.${slug(family)}${suffix++}@journeyos.dev`;
    }
    usedEmails.add(email);

    const tier = rng.weighted(TIER_DISTRIBUTION);
    const [minPoints, maxPoints] = TIER_POINTS[tier];
    const home = AIRPORTS_BY_IATA.get(rng.pick(locale.homeAirports))!;
    const joinedDaysAgo = rng.int(30, 2_400);

    const customerId = CustomerIds.generate();
    const preferredCarriers = rng.sample(AIRLINES, rng.int(0, 3)).map((airline) => airline.iata);

    customers.push({
      id: customerId,
      name,
      email,
      phone: `+${rng.int(1, 99)} ${rng.int(100, 999)} ${rng.int(1000, 9999)}`,
      loyaltyTier: tier,
      loyaltyPoints: rng.int(minPoints, maxPoints),
      preferences: {
        priority: rng.weighted(PRIORITIES),
        preferredCabin: rng.pick(TIER_CABIN[tier]),
        seatPreference: rng.pick(['window', 'aisle', 'no_preference'] as const),
        maxLayovers: rng.weighted([
          [0, 20],
          [1, 50],
          [2, 30],
        ]),
        preferredAirlines: preferredCarriers,
        dietaryRequirements: rng.chance(0.3)
          ? [rng.pick(['vegetarian', 'vegan', 'halal', 'kosher', 'gluten_free'])]
          : [],
        locale: locale.locale,
        timezone: locale.timezone,
      },
      createdAt: at(-joinedDaysAgo * DAY),
      updatedAt: at(-rng.int(1, 20) * DAY),
    });

    // --- Consent: higher tiers have had more chances to opt in ------------
    const grantOdds = { standard: 0.72, bronze: 0.78, silver: 0.84, gold: 0.9, platinum: 0.94 }[tier];
    const grants: Array<readonly [ConsentChannel, ConsentPurpose]> = [
      ['email', 'service_updates'],
      ['push', 'service_updates'],
      ['in_app', 'service_updates'],
      ['email', 'automated_rebooking'],
      ['email', 'personalization'],
      ['sms', 'marketing'],
    ];

    for (const [channel, purpose] of grants) {
      const granted =
        purpose === 'service_updates' && channel === 'email'
          ? true // Everyone accepts essential email updates.
          : purpose === 'marketing'
            ? rng.chance(0.3)
            : rng.chance(grantOdds);

      consents.push({
        id: ConsentIds.generate(),
        customerId,
        channel,
        purpose,
        granted,
        source: 'traveler_app_preferences',
        capturedAt: at(-rng.int(10, Math.max(11, joinedDaysAgo)) * DAY),
        revokedAt: null,
      });
    }

    // --- Active journey ---------------------------------------------------
    const destination = rng.pick(AIRPORTS.filter((airport) => airport.iata !== home.iata));
    const carrier = rng.pick(AIRLINES);
    const km = distanceKm(home, destination);
    const departsIn = rng.int(2, 9) * HOUR;

    const activeJourneyId = JourneyIds.generate();
    const startedDaysAgo = rng.int(1, 12);
    const flightNumber = `${carrier.iata}${rng.int(100, 9999)}`;
    const liveDisruption = rng.chance(liveDisruptionRate);

    journeys.push({
      id: activeJourneyId,
      customerId,
      template: 'travel.disruption_recovery',
      status: liveDisruption ? 'disrupted' : 'active',
      goal: `Reach ${destination.city} for ${rng.pick(TRIP_PURPOSES)}.`,
      context: {
        origin: home.iata,
        destination: destination.iata,
        bookingReference: `${carrier.iata}${rng.int(10000, 99999)}`,
        carrier: carrier.iata,
        flightNumber,
        scheduledDeparture: at(departsIn).toISOString(),
        scheduledArrival: at(departsIn + blockMinutes(km) * 60_000).toISOString(),
        arriveBy: rng.chance(0.6) ? at(departsIn + (blockMinutes(km) + rng.int(90, 600)) * 60_000).toISOString() : null,
        cabin: rng.pick(TIER_CABIN[tier]),
        passengerCount: rng.weighted([
          [1, 70],
          [2, 22],
          [3, 8],
        ]),
        distanceKm: km,
      },
      startedAt: at(-startedDaysAgo * DAY),
      completedAt: null,
      createdAt: at(-startedDaysAgo * DAY),
      updatedAt: at(-rng.int(1, 12) * HOUR),
    });

    // A live disruption on the active journey, so the graph and ledger are
    // populated the moment an operator selects this customer.
    if (liveDisruption) {
      const liveType = rng.weighted<EventType>([
        ['FlightCancelled', 40],
        ['FlightDelayed', 40],
        ['GateChanged', 12],
        ['HotelIssue', 8],
      ]);
      const minutesAgo = rng.int(4, 220);
      const occurredAt = at(-minutesAgo * 60_000);
      const correlationId = correlationIdSchema.parse(`live-${customerId.slice(-10)}-${flightNumber}`);
      const severity = liveType === 'FlightCancelled' ? 'high' : liveType === 'GateChanged' ? 'low' : 'medium';

      events.push({
        id: EventIds.generate(),
        type: liveType,
        customerId,
        journeyId: activeJourneyId,
        correlationId,
        severity,
        source: rng.pick(['amadeus.ops', 'airline.ops-feed', 'airport.ops']),
        payload: {
          flightNumber,
          carrier: carrier.iata,
          origin: home.iata,
          destination: destination.iata,
          reason: rng.pick(['technical', 'weather', 'crew_shortage', 'operational', 'atc']),
          ...(liveType === 'FlightDelayed' ? { delayMinutes: rng.int(45, 420) } : {}),
        },
        occurredAt,
        receivedAt: occurredAt,
      });

      auditRecords.push({
        id: AuditRecordIds.generate(),
        journeyId: activeJourneyId,
        correlationId,
        stage: 'event',
        actor: 'system',
        action: `event.${liveType}`,
        outcome: 'success',
        summary: `Ingested ${liveType} (${severity}) for ${flightNumber}.`,
        payload: { flightNumber, severity },
        occurredAt,
      });
    }

    // --- History: frequent flyers accumulate more, and more disruption ----
    const historyCount = rng.weighted([
      [0, 12],
      [1, 22],
      [2, 26],
      [3, 20],
      [4, 12],
      [5, 8],
    ]);

    for (let h = 0; h < historyCount; h++) {
      const pastDestination = rng.pick(AIRPORTS.filter((airport) => airport.iata !== home.iata));
      const pastCarrier = rng.pick(AIRLINES);
      const daysAgo = rng.int(8, 330);
      const disrupted = rng.chance(1 - pastCarrier.onTimeRate);
      const disruptionType = disrupted ? rng.pick(DISRUPTION_TYPES) : undefined;
      const compensated = disrupted && rng.chance(0.45);
      const flightNumber = `${pastCarrier.iata}${rng.int(100, 9999)}`;
      const pastJourneyId = JourneyIds.generate();

      journeys.push({
        id: pastJourneyId,
        customerId,
        template: 'travel.disruption_recovery',
        status: 'completed',
        goal: `Reach ${pastDestination.city} for ${rng.pick(TRIP_PURPOSES)}.`,
        context: {
          origin: home.iata,
          destination: pastDestination.iata,
          carrier: pastCarrier.iata,
          flightNumber,
          disrupted,
          ...(disruptionType ? { disruptionType } : {}),
          compensationIssued: compensated
            ? {
                type: rng.pick(['voucher', 'refund', 'miles']),
                amountEur: rng.int(60, 600),
                issuedAt: at(-(daysAgo - 1) * DAY).toISOString(),
              }
            : null,
        },
        startedAt: at(-daysAgo * DAY),
        completedAt: at(-(daysAgo - 1) * DAY),
        createdAt: at(-daysAgo * DAY),
        updatedAt: at(-(daysAgo - 1) * DAY),
      });

      if (disruptionType) {
        events.push({
          id: EventIds.generate(),
          type: disruptionType,
          customerId,
          journeyId: pastJourneyId,
          correlationId: correlationIdSchema.parse(`gen-${customerId.slice(-8)}-${h}-${flightNumber}`),
          severity: disruptionType === 'FlightCancelled' ? 'high' : 'medium',
          source: 'seed.history',
          payload: {
            flightNumber,
            carrier: pastCarrier.iata,
            reason: rng.pick(['technical', 'weather', 'crew_shortage', 'operational', 'atc']),
          },
          occurredAt: at(-daysAgo * DAY),
          receivedAt: at(-daysAgo * DAY),
        });
      }
    }
  }

  return { customers, journeys, consents, events, auditRecords };
}
