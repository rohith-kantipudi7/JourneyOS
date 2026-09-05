import { describe, expect, it } from 'vitest';

import {
  buildTradeoffTable,
  clampScores,
  rankOptions,
  scoreCandidatesDeterministically,
  weightedScore,
  WEIGHTS_BY_PRIORITY,
  type ScoredCandidate,
} from '@/core/decision';
import { SimulatedTravelAdapter } from '@/adapters';
import type { DimensionScores } from '@/types';

const NOW = new Date('2026-03-01T12:00:00.000Z');

const scores = (overrides: Partial<DimensionScores> = {}): DimensionScores =>
  clampScores({
    arrivalTime: 50,
    cost: 50,
    comfort: 50,
    loyaltyImpact: 50,
    sustainability: 50,
    rebookingRisk: 50,
    ...overrides,
  });

const candidate = (id: string, override: Partial<ScoredCandidate> = {}): ScoredCandidate => ({
  optionId: id,
  label: id,
  summary: 'summary',
  actionType: 'rebookFlight',
  scores: scores(),
  estimatedCost: 200,
  currency: 'EUR',
  evidence: ['e'],
  executionParams: {},
  ...override,
});

describe('score clamping', () => {
  it('clamps out-of-range values a model might emit', () => {
    const clamped = clampScores({ arrivalTime: 140, cost: -20 });
    expect(clamped.arrivalTime).toBe(100);
    expect(clamped.cost).toBe(0);
  });

  it('defaults a missing dimension to neutral rather than zero', () => {
    expect(clampScores({}).comfort).toBe(50);
  });
});

describe('weighted scoring', () => {
  it('normalizes by total weight', () => {
    const value = weightedScore(scores({ arrivalTime: 100 }), WEIGHTS_BY_PRIORITY.fastest);
    expect(value).toBeGreaterThan(50);
    expect(value).toBeLessThanOrEqual(100);
  });

  it('lets the customer priority change which option wins', () => {
    const fast = candidate('fast', { scores: scores({ arrivalTime: 100, cost: 10 }), estimatedCost: 400 });
    const cheap = candidate('cheap', { scores: scores({ arrivalTime: 10, cost: 100 }), estimatedCost: 100 });

    const bySpeed = rankOptions([fast, cheap], WEIGHTS_BY_PRIORITY.fastest);
    const byPrice = rankOptions([fast, cheap], WEIGHTS_BY_PRIORITY.cheapest);

    expect(bySpeed[0]?.optionId).toBe('fast');
    expect(byPrice[0]?.optionId).toBe('cheap');
  });
});

describe('deterministic ranking', () => {
  it('produces an identical ranking for identical scores', () => {
    const input = [candidate('a', { scores: scores({ cost: 80 }) }), candidate('b')];

    const first = rankOptions(input, WEIGHTS_BY_PRIORITY.fastest);
    const second = rankOptions(input, WEIGHTS_BY_PRIORITY.fastest);

    expect(first).toEqual(second);
  });

  it('is independent of input order', () => {
    const a = candidate('a', { scores: scores({ cost: 80 }) });
    const b = candidate('b', { scores: scores({ comfort: 90 }) });

    const forward = rankOptions([a, b], WEIGHTS_BY_PRIORITY.fastest).map((o) => o.optionId);
    const reversed = rankOptions([b, a], WEIGHTS_BY_PRIORITY.fastest).map((o) => o.optionId);

    expect(forward).toEqual(reversed);
  });

  it('breaks ties on cost, then on option id', () => {
    const cheap = candidate('z-cheap', { estimatedCost: 100 });
    const dear = candidate('a-dear', { estimatedCost: 500 });

    expect(rankOptions([dear, cheap], WEIGHTS_BY_PRIORITY.fastest)[0]?.optionId).toBe('z-cheap');
  });

  it('assigns contiguous ranks starting at 1', () => {
    const ranked = rankOptions([candidate('a'), candidate('b'), candidate('c')], WEIGHTS_BY_PRIORITY.fastest);
    expect(ranked.map((option) => option.rank)).toEqual([1, 2, 3]);
  });
});

describe('tradeoff table', () => {
  it('reports a delta per dimension against every alternative', () => {
    const ranked = rankOptions(
      [candidate('a', { scores: scores({ cost: 90 }) }), candidate('b', { scores: scores({ cost: 20 }) })],
      WEIGHTS_BY_PRIORITY.cheapest,
    );

    const table = buildTradeoffTable(ranked[0]!, ranked.slice(1), WEIGHTS_BY_PRIORITY.cheapest);
    const costRow = table.rows.find((row) => row.dimension === 'cost');

    expect(table.rows).toHaveLength(6);
    expect(costRow?.best).toBe(90);
    expect(costRow?.deltas[0]).toBe(-70);
  });
});

describe('deterministic fallback planner', () => {
  it('scores real adapter candidates without any AI', async () => {
    const adapter = new SimulatedTravelAdapter(() => NOW);
    const candidates = await adapter.searchAlternatives({
      origin: 'BLR',
      destination: 'CDG',
      notBefore: NOW.toISOString(),
      arriveBy: new Date(NOW.getTime() + 20 * 3600_000).toISOString(),
      preferredCabin: 'business',
      passengerCount: 1,
      maxLayovers: 1,
      preferredCarriers: ['AF'],
    });

    const scored = scoreCandidatesDeterministically(candidates);

    expect(scored).toHaveLength(candidates.length);
    for (const option of scored) {
      for (const value of Object.values(option.scores)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });

  it('rewards the cheapest option on the cost dimension', async () => {
    const adapter = new SimulatedTravelAdapter(() => NOW);
    const candidates = await adapter.searchAlternatives({
      origin: 'BLR',
      destination: 'CDG',
      notBefore: NOW.toISOString(),
      arriveBy: null,
      preferredCabin: 'economy',
      passengerCount: 1,
      maxLayovers: 2,
      preferredCarriers: [],
    });

    const scored = scoreCandidatesDeterministically(candidates);
    const cheapest = [...candidates].sort((a, b) => a.cost - b.cost)[0]!;

    expect(scored.find((option) => option.optionId === cheapest.id)?.scores.cost).toBe(100);
  });
});

describe('simulated travel adapter', () => {
  it('returns identical inventory for identical input', async () => {
    const adapter = new SimulatedTravelAdapter(() => NOW);
    const search = {
      origin: 'BLR',
      destination: 'CDG',
      notBefore: NOW.toISOString(),
      arriveBy: null,
      preferredCabin: 'business' as const,
      passengerCount: 1,
      maxLayovers: 2,
      preferredCarriers: [],
    };

    expect(await adapter.searchAlternatives(search)).toEqual(await adapter.searchAlternatives(search));
  });

  it('honours the customer max-layover preference', async () => {
    const adapter = new SimulatedTravelAdapter(() => NOW);
    const direct = await adapter.searchAlternatives({
      origin: 'BLR',
      destination: 'CDG',
      notBefore: NOW.toISOString(),
      arriveBy: null,
      preferredCabin: 'business',
      passengerCount: 1,
      maxLayovers: 0,
      preferredCarriers: [],
    });

    expect(direct.every((candidate) => candidate.stops === 0)).toBe(true);
  });

  it('scales cost and emissions with passenger count', async () => {
    const adapter = new SimulatedTravelAdapter(() => NOW);
    const base = {
      origin: 'BLR',
      destination: 'CDG',
      notBefore: NOW.toISOString(),
      arriveBy: null,
      preferredCabin: 'economy' as const,
      maxLayovers: 2,
      preferredCarriers: [],
    };

    const one = await adapter.searchAlternatives({ ...base, passengerCount: 1 });
    const two = await adapter.searchAlternatives({ ...base, passengerCount: 2 });

    expect(two[0]!.cost).toBe(one[0]!.cost * 2);
  });
});
