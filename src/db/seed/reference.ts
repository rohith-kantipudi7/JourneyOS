/**
 * Aviation reference data.
 *
 * Real IATA codes, cities, and coordinates. Coordinates matter: route distance
 * is computed by haversine, which then drives realistic flight durations and
 * CO2 estimates instead of invented numbers.
 */

export interface Airport {
  readonly iata: string;
  readonly city: string;
  readonly country: string;
  readonly region: 'IN' | 'EU' | 'ME' | 'APAC' | 'AMER' | 'AFR';
  readonly lat: number;
  readonly lon: number;
}

export const AIRPORTS: readonly Airport[] = [
  { iata: 'BLR', city: 'Bengaluru', country: 'India', region: 'IN', lat: 13.1979, lon: 77.7063 },
  { iata: 'BOM', city: 'Mumbai', country: 'India', region: 'IN', lat: 19.0887, lon: 72.8679 },
  { iata: 'DEL', city: 'Delhi', country: 'India', region: 'IN', lat: 28.5562, lon: 77.1 },
  { iata: 'MAA', city: 'Chennai', country: 'India', region: 'IN', lat: 12.99, lon: 80.1693 },
  { iata: 'HYD', city: 'Hyderabad', country: 'India', region: 'IN', lat: 17.2403, lon: 78.4294 },

  { iata: 'CDG', city: 'Paris', country: 'France', region: 'EU', lat: 49.0097, lon: 2.5479 },
  { iata: 'LHR', city: 'London', country: 'United Kingdom', region: 'EU', lat: 51.47, lon: -0.4543 },
  { iata: 'AMS', city: 'Amsterdam', country: 'Netherlands', region: 'EU', lat: 52.3105, lon: 4.7683 },
  { iata: 'FRA', city: 'Frankfurt', country: 'Germany', region: 'EU', lat: 50.0379, lon: 8.5622 },
  { iata: 'MUC', city: 'Munich', country: 'Germany', region: 'EU', lat: 48.3538, lon: 11.7861 },
  { iata: 'ZRH', city: 'Zurich', country: 'Switzerland', region: 'EU', lat: 47.4647, lon: 8.5492 },
  { iata: 'MXP', city: 'Milan', country: 'Italy', region: 'EU', lat: 45.6306, lon: 8.7281 },
  { iata: 'FCO', city: 'Rome', country: 'Italy', region: 'EU', lat: 41.8003, lon: 12.2389 },
  { iata: 'MAD', city: 'Madrid', country: 'Spain', region: 'EU', lat: 40.4839, lon: -3.568 },
  { iata: 'BCN', city: 'Barcelona', country: 'Spain', region: 'EU', lat: 41.2974, lon: 2.0833 },
  { iata: 'LIS', city: 'Lisbon', country: 'Portugal', region: 'EU', lat: 38.7742, lon: -9.1342 },
  { iata: 'DUB', city: 'Dublin', country: 'Ireland', region: 'EU', lat: 53.4213, lon: -6.2701 },
  { iata: 'CPH', city: 'Copenhagen', country: 'Denmark', region: 'EU', lat: 55.6181, lon: 12.6561 },
  { iata: 'ARN', city: 'Stockholm', country: 'Sweden', region: 'EU', lat: 59.6519, lon: 17.9186 },
  { iata: 'OSL', city: 'Oslo', country: 'Norway', region: 'EU', lat: 60.1939, lon: 11.1004 },
  { iata: 'HEL', city: 'Helsinki', country: 'Finland', region: 'EU', lat: 60.3172, lon: 24.9633 },
  { iata: 'VIE', city: 'Vienna', country: 'Austria', region: 'EU', lat: 48.1103, lon: 16.5697 },
  { iata: 'BRU', city: 'Brussels', country: 'Belgium', region: 'EU', lat: 50.9014, lon: 4.4844 },
  { iata: 'IST', city: 'Istanbul', country: 'Türkiye', region: 'EU', lat: 41.2753, lon: 28.7519 },

  { iata: 'DXB', city: 'Dubai', country: 'UAE', region: 'ME', lat: 25.2532, lon: 55.3657 },
  { iata: 'AUH', city: 'Abu Dhabi', country: 'UAE', region: 'ME', lat: 24.433, lon: 54.6511 },
  { iata: 'DOH', city: 'Doha', country: 'Qatar', region: 'ME', lat: 25.2731, lon: 51.6081 },

  { iata: 'SIN', city: 'Singapore', country: 'Singapore', region: 'APAC', lat: 1.3644, lon: 103.9915 },
  { iata: 'HKG', city: 'Hong Kong', country: 'Hong Kong', region: 'APAC', lat: 22.308, lon: 113.9185 },
  { iata: 'HND', city: 'Tokyo', country: 'Japan', region: 'APAC', lat: 35.5494, lon: 139.7798 },
  { iata: 'ICN', city: 'Seoul', country: 'South Korea', region: 'APAC', lat: 37.4602, lon: 126.4407 },
  { iata: 'BKK', city: 'Bangkok', country: 'Thailand', region: 'APAC', lat: 13.69, lon: 100.7501 },
  { iata: 'SYD', city: 'Sydney', country: 'Australia', region: 'APAC', lat: -33.9399, lon: 151.1753 },

  { iata: 'JFK', city: 'New York', country: 'United States', region: 'AMER', lat: 40.6413, lon: -73.7781 },
  { iata: 'SFO', city: 'San Francisco', country: 'United States', region: 'AMER', lat: 37.6213, lon: -122.379 },
  { iata: 'ORD', city: 'Chicago', country: 'United States', region: 'AMER', lat: 41.9742, lon: -87.9073 },
  { iata: 'YYZ', city: 'Toronto', country: 'Canada', region: 'AMER', lat: 43.6777, lon: -79.6248 },
  { iata: 'GRU', city: 'São Paulo', country: 'Brazil', region: 'AMER', lat: -23.4356, lon: -46.4731 },

  { iata: 'JNB', city: 'Johannesburg', country: 'South Africa', region: 'AFR', lat: -26.1367, lon: 28.246 },
  { iata: 'CAI', city: 'Cairo', country: 'Egypt', region: 'AFR', lat: 30.1219, lon: 31.4056 },
];

export interface Airline {
  readonly iata: string;
  readonly name: string;
  readonly alliance: 'SkyTeam' | 'Star Alliance' | 'oneworld' | 'Independent';
  readonly hub: string;
  /** Grams of CO2 per passenger-kilometre — varies with fleet age and density. */
  readonly co2PerPaxKm: number;
  /** Baseline share of departures that are on time, from published punctuality data. */
  readonly onTimeRate: number;
}

export const AIRLINES: readonly Airline[] = [
  { iata: 'AF', name: 'Air France', alliance: 'SkyTeam', hub: 'CDG', co2PerPaxKm: 88, onTimeRate: 0.79 },
  { iata: 'KL', name: 'KLM', alliance: 'SkyTeam', hub: 'AMS', co2PerPaxKm: 84, onTimeRate: 0.81 },
  { iata: 'AZ', name: 'ITA Airways', alliance: 'SkyTeam', hub: 'FCO', co2PerPaxKm: 91, onTimeRate: 0.78 },
  { iata: 'DL', name: 'Delta Air Lines', alliance: 'SkyTeam', hub: 'JFK', co2PerPaxKm: 95, onTimeRate: 0.83 },

  { iata: 'LH', name: 'Lufthansa', alliance: 'Star Alliance', hub: 'FRA', co2PerPaxKm: 90, onTimeRate: 0.77 },
  { iata: 'LX', name: 'SWISS', alliance: 'Star Alliance', hub: 'ZRH', co2PerPaxKm: 86, onTimeRate: 0.82 },
  { iata: 'OS', name: 'Austrian Airlines', alliance: 'Star Alliance', hub: 'VIE', co2PerPaxKm: 89, onTimeRate: 0.8 },
  { iata: 'SK', name: 'SAS', alliance: 'Star Alliance', hub: 'CPH', co2PerPaxKm: 87, onTimeRate: 0.76 },
  { iata: 'TK', name: 'Turkish Airlines', alliance: 'Star Alliance', hub: 'IST', co2PerPaxKm: 92, onTimeRate: 0.74 },
  { iata: 'SQ', name: 'Singapore Airlines', alliance: 'Star Alliance', hub: 'SIN', co2PerPaxKm: 79, onTimeRate: 0.86 },
  { iata: 'NH', name: 'ANA', alliance: 'Star Alliance', hub: 'HND', co2PerPaxKm: 81, onTimeRate: 0.89 },
  { iata: 'AI', name: 'Air India', alliance: 'Star Alliance', hub: 'DEL', co2PerPaxKm: 98, onTimeRate: 0.7 },

  { iata: 'BA', name: 'British Airways', alliance: 'oneworld', hub: 'LHR', co2PerPaxKm: 93, onTimeRate: 0.75 },
  { iata: 'IB', name: 'Iberia', alliance: 'oneworld', hub: 'MAD', co2PerPaxKm: 88, onTimeRate: 0.81 },
  { iata: 'AY', name: 'Finnair', alliance: 'oneworld', hub: 'HEL', co2PerPaxKm: 83, onTimeRate: 0.84 },
  { iata: 'QR', name: 'Qatar Airways', alliance: 'oneworld', hub: 'DOH', co2PerPaxKm: 82, onTimeRate: 0.85 },
  { iata: 'CX', name: 'Cathay Pacific', alliance: 'oneworld', hub: 'HKG', co2PerPaxKm: 85, onTimeRate: 0.82 },
  { iata: 'JL', name: 'Japan Airlines', alliance: 'oneworld', hub: 'HND', co2PerPaxKm: 80, onTimeRate: 0.9 },
  { iata: 'QF', name: 'Qantas', alliance: 'oneworld', hub: 'SYD', co2PerPaxKm: 90, onTimeRate: 0.78 },

  { iata: 'EK', name: 'Emirates', alliance: 'Independent', hub: 'DXB', co2PerPaxKm: 94, onTimeRate: 0.83 },
  { iata: 'EY', name: 'Etihad Airways', alliance: 'Independent', hub: 'AUH', co2PerPaxKm: 91, onTimeRate: 0.84 },
  { iata: '6E', name: 'IndiGo', alliance: 'Independent', hub: 'DEL', co2PerPaxKm: 76, onTimeRate: 0.81 },
];

export const AIRPORTS_BY_IATA = new Map(AIRPORTS.map((airport) => [airport.iata, airport]));
export const AIRLINES_BY_IATA = new Map(AIRLINES.map((airline) => [airline.iata, airline]));

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Great-circle distance between two airports, in kilometres. */
export function distanceKm(from: Airport, to: Airport): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLon = toRadians(to.lon - from.lon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLon / 2) ** 2;

  return Math.round(EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/** Block time including taxi and climb, derived from distance rather than invented. */
export function blockMinutes(km: number): number {
  const cruiseKmh = 840;
  return Math.round(35 + (km / cruiseKmh) * 60);
}

/** Long-haul seats are cheaper per kilometre than short hops. */
export function baseFareEur(km: number, cabinMultiplier: number): number {
  const perKm = km < 1500 ? 0.16 : km < 5000 ? 0.11 : 0.085;
  return Math.round((60 + km * perKm) * cabinMultiplier);
}

export const CABIN_FARE_MULTIPLIER: Readonly<Record<string, number>> = {
  economy: 1,
  premium_economy: 1.7,
  business: 3.1,
  first: 5.4,
};

export function co2Kg(airline: Airline, km: number, cabinMultiplier: number): number {
  // Premium cabins occupy more floor area, so they carry a larger share of emissions.
  const cabinShare = 0.6 + cabinMultiplier * 0.4;
  return Math.round((airline.co2PerPaxKm * km * cabinShare) / 1000);
}
