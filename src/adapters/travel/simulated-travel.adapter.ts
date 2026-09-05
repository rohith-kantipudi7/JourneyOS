import {
  AIRLINES,
  AIRPORTS_BY_IATA,
  CABIN_FARE_MULTIPLIER,
  baseFareEur,
  blockMinutes,
  co2Kg,
  distanceKm,
  type Airline,
  type Airport,
} from '@/db/seed/reference';
import { createRng } from '@/db/seed/random';
import type {
  AlternativeSearch,
  CabinClass,
  RebookRequest,
  RebookResult,
  RecoveryCandidate,
  TravelAdapter,
} from '@/types';

/**
 * Amadeus-shaped travel adapter, simulated.
 *
 * Inventory is derived from real airport coordinates and carrier data: the
 * great-circle distance sets the block time, fare, and emissions, and a seeded
 * PRNG keyed on the route keeps results identical for identical searches.
 * A demo must be reproducible, and so must the reasoning built on top of it.
 */

const MINUTE = 60_000;

const CABIN_LADDER: readonly CabinClass[] = ['economy', 'premium_economy', 'business', 'first'];

function routeSeed(origin: string, destination: string, cabin: string): number {
  return [...`${origin}${destination}${cabin}`].reduce((hash, char) => hash * 31 + char.charCodeAt(0), 7) >>> 0;
}

/** Carriers that plausibly serve a route: either endpoint, or a hub in between. */
function carriersFor(from: Airport, to: Airport): Airline[] {
  const direct = AIRLINES.filter((airline) => airline.hub === from.iata || airline.hub === to.iata);
  const connecting = AIRLINES.filter((airline) => {
    const hub = AIRPORTS_BY_IATA.get(airline.hub);
    if (!hub || direct.includes(airline)) return false;
    // A hub is viable if routing through it does not add more than 40% distance.
    const detour = distanceKm(from, hub) + distanceKm(hub, to);
    return detour <= distanceKm(from, to) * 1.4;
  });

  return [...direct, ...connecting];
}

function downgrade(cabin: CabinClass, steps: number): CabinClass {
  const index = CABIN_LADDER.indexOf(cabin);
  return CABIN_LADDER[Math.max(0, index - steps)]!;
}

export class SimulatedTravelAdapter implements TravelAdapter {
  readonly provider = 'amadeus-simulator';

  constructor(private readonly now: () => Date = () => new Date()) {}

  async searchAlternatives(search: AlternativeSearch): Promise<RecoveryCandidate[]> {
    const from = AIRPORTS_BY_IATA.get(search.origin);
    const to = AIRPORTS_BY_IATA.get(search.destination);
    if (!from || !to || from.iata === to.iata) return [];

    const rng = createRng(routeSeed(search.origin, search.destination, search.preferredCabin));
    const km = distanceKm(from, to);
    const base = new Date(search.notBefore).getTime();
    const deadline = search.arriveBy ? new Date(search.arriveBy).getTime() : null;
    const fetchedAt = this.now().toISOString();

    const pool = carriersFor(from, to);
    if (pool.length === 0) return [];

    // What the original ticket was worth, used to price the change rather than
    // the whole journey — a disruption rebooking commits the fare *difference*.
    const originalFare = baseFareEur(km, CABIN_FARE_MULTIPLIER[search.preferredCabin] ?? 1);
    const changeFeeEur = 55;

    const chosen = rng.sample(pool, Math.min(5, Math.max(3, pool.length)));
    const candidates: RecoveryCandidate[] = [];

    for (const [index, airline] of chosen.entries()) {
      const stops = airline.hub === from.iata || airline.hub === to.iata ? 0 : 1;
      if (stops > search.maxLayovers) continue;

      const viaHub = stops === 1 ? AIRPORTS_BY_IATA.get(airline.hub) : undefined;
      const routedKm = viaHub ? distanceKm(from, viaHub) + distanceKm(viaHub, to) : km;

      // Premium inventory sells out first, so deeper cabins appear less often.
      const cabin = rng.chance(0.65) ? search.preferredCabin : downgrade(search.preferredCabin, 1);
      const multiplier = CABIN_FARE_MULTIPLIER[cabin] ?? 1;

      const departOffset = (45 + index * 55 + rng.int(0, 90)) * MINUTE;
      const departAt = base + departOffset;
      const duration = blockMinutes(routedKm) + (stops === 1 ? rng.int(60, 150) : 0);
      const arriveAt = departAt + duration * MINUTE;

      const seats = rng.weighted([
        [rng.int(1, 2), 25],
        [rng.int(3, 6), 45],
        [rng.int(7, 14), 30],
      ]);

      const fareEur = Math.round(baseFareEur(routedKm, multiplier) * (0.9 + rng.next() * 0.35));
      // Never below the change fee, never negative when the alternative is cheaper.
      const changeCost = Math.max(changeFeeEur, fareEur - originalFare) * search.passengerCount;
      const flightNumber = `${airline.iata}${100 + index * 137 + (routedKm % 800)}`;

      candidates.push({
        id: `cand_${flightNumber}`,
        actionType: 'rebookFlight',
        label: `${flightNumber} · ${airline.name}${viaHub ? ` via ${viaHub.city}` : ' direct'}`,
        summary:
          stops === 0
            ? `Direct ${cabin.replace('_', ' ')} service to ${to.city}, ${Math.round(duration / 60)}h block time.`
            : `One stop in ${viaHub!.city}, ${cabin.replace('_', ' ')} cabin, ${Math.round(duration / 60)}h total.`,
        cost: changeCost,
        currency: 'EUR',
        arrivalDeltaMinutes: deadline === null ? 0 : Math.round((arriveAt - deadline) / MINUTE),
        departAt: new Date(departAt).toISOString(),
        arriveAt: new Date(arriveAt).toISOString(),
        stops,
        cabin,
        carrier: airline.iata,
        co2Kg: co2Kg(airline, routedKm, multiplier) * search.passengerCount,
        seatsAvailable: seats,
        // Published punctuality, penalised for the extra connection risk.
        confirmationLikelihood: Math.min(0.99, airline.onTimeRate + (stops === 0 ? 0.12 : 0.02)),
        fetchedAt,
        executionParams: {
          flightNumber,
          carrier: airline.iata,
          cabin,
          passengerCount: search.passengerCount,
          origin: search.origin,
          destination: search.destination,
          departAt: new Date(departAt).toISOString(),
          arriveAt: new Date(arriveAt).toISOString(),
          fareEur: fareEur * search.passengerCount,
          changeCostEur: changeCost,
          distanceKm: routedKm,
        },
      });
    }

    return candidates.sort((a, b) => {
      const aPreferred = search.preferredCarriers.includes(a.carrier ?? '') ? 0 : 1;
      const bPreferred = search.preferredCarriers.includes(b.carrier ?? '') ? 0 : 1;
      return aPreferred - bPreferred || a.cost - b.cost;
    });
  }

  async rebook(request: RebookRequest): Promise<RebookResult> {
    const departAt = new Date(this.now().getTime() + 4 * 60 * MINUTE).toISOString();

    return {
      bookingReference: request.bookingReference,
      ticketNumber: `TKT-${request.candidateId.replace('cand_', '').toUpperCase()}`,
      flightNumber: request.flightNumber,
      departAt,
      arriveAt: new Date(new Date(departAt).getTime() + 620 * MINUTE).toISOString(),
      cabin: request.cabin,
      provider: this.provider,
    };
  }

  async issueVoucher(input: { customerRef: string; amount: number; currency: string }) {
    return {
      voucherCode: `VCH-${input.customerRef.slice(-6).toUpperCase()}`,
      amount: input.amount,
      currency: input.currency,
      expiresAt: new Date(this.now().getTime() + 365 * 24 * 60 * MINUTE).toISOString(),
    };
  }

  async reserveHotel(input: { city: string; nights: number; guests: number }) {
    const airport = AIRPORTS_BY_IATA.get(input.city);
    return {
      reservationId: `HTL-${input.city.toUpperCase()}-${input.nights}`,
      propertyName: `Grand Central ${airport?.city ?? input.city}`,
      nights: input.nights,
    };
  }
}
