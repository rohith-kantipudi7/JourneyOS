import {
  DecisionIds,
  EventIds,
  SnapshotIds,
  correlationIdSchema,
  type CustomerId,
  type EventId,
  type JourneyId,
  type SnapshotId,
} from '@/core/shared';
import type {
  DecisionOption,
  DimensionScores,
  DimensionWeights,
  NewContextSnapshot,
  NewDecision,
  NewJourneyEvent,
  TrustEvaluation,
} from '@/types';

const EVEN_SCORES: DimensionScores = {
  arrivalTime: 80,
  cost: 60,
  comfort: 70,
  loyaltyImpact: 50,
  sustainability: 40,
  rebookingRisk: 90,
};

export const TEST_WEIGHTS: DimensionWeights = {
  arrivalTime: 0.3,
  cost: 0.2,
  comfort: 0.15,
  loyaltyImpact: 0.1,
  sustainability: 0.05,
  rebookingRisk: 0.2,
};

export function buildOption(overrides: Partial<DecisionOption> = {}): DecisionOption {
  return {
    optionId: 'opt_af_direct',
    label: 'AF 193 — direct, departs 21:40',
    summary: 'Rebook onto the next direct Air France service.',
    actionType: 'rebookFlight',
    scores: EVEN_SCORES,
    weightedScore: 72.5,
    rank: 1,
    estimatedCost: 240,
    currency: 'EUR',
    evidence: ['2 business seats available', 'Arrives 3h before the deadline'],
    executionParams: { flightNumber: 'AF193', cabin: 'business' },
    ...overrides,
  };
}

export function buildTrustEvaluation(overrides: Partial<TrustEvaluation> = {}): TrustEvaluation {
  return {
    outcome: 'needs_customer_approval',
    riskScore: 42,
    riskFactors: [{ id: 'spend', label: 'Rebooking spend', value: 40, weight: 0.5 }],
    checks: [
      {
        kind: 'consent',
        policyId: 'consent.automated_rebooking',
        label: 'Automated rebooking consent',
        passed: true,
        reason: 'Customer granted automated rebooking over email.',
      },
    ],
    policyVersion: 'test-1',
    evaluatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

export function buildEvent(
  customerId: CustomerId,
  journeyId: JourneyId,
  overrides: Partial<NewJourneyEvent> = {},
): NewJourneyEvent {
  return {
    id: EventIds.generate(),
    type: 'FlightCancelled',
    customerId,
    journeyId,
    correlationId: correlationIdSchema.parse(`test-${EventIds.generate()}`),
    severity: 'high',
    source: 'test.harness',
    payload: { flightNumber: 'AF191', reason: 'technical' },
    occurredAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

export function buildSnapshot(
  journeyId: JourneyId,
  customerId: CustomerId,
  eventId: EventId,
  overrides: Partial<NewContextSnapshot> = {},
): NewContextSnapshot {
  return {
    id: SnapshotIds.generate(),
    journeyId,
    customerId,
    eventId,
    nodes: [
      {
        id: 'customer',
        type: 'Customer',
        label: 'Customer',
        data: { loyaltyTier: 'gold' },
        provenance: {
          sourceSystem: 'crm',
          retrievedAt: new Date('2026-01-01T00:00:00.000Z'),
          stale: false,
          ageSeconds: 5,
        },
      },
    ],
    edges: [{ id: 'e1', type: 'TRIGGERS', from: 'event', to: 'journey', label: 'triggers' }],
    stale: false,
    ...overrides,
  };
}

export function buildDecision(
  journeyId: JourneyId,
  eventId: EventId,
  snapshotId: SnapshotId,
  overrides: Partial<NewDecision> = {},
): NewDecision {
  return {
    id: DecisionIds.generate(),
    journeyId,
    eventId,
    snapshotId,
    status: 'proposed',
    planner: 'deterministic_fallback',
    model: null,
    promptVersion: 'test-1',
    weights: TEST_WEIGHTS,
    bestOption: buildOption(),
    alternatives: [buildOption({ optionId: 'opt_kl_via_ams', rank: 2, weightedScore: 61.4 })],
    confidence: 0.82,
    reasoning: 'Direct service preserves the arrival deadline at acceptable cost.',
    evidence: ['Deadline is 20:00 local', 'Customer priority is fastest'],
    trust: buildTrustEvaluation(),
    ...overrides,
  };
}
