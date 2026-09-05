import type { TradeoffTable } from '@/core/decision';
import type {
  ContextEdge,
  ContextNode,
  DecisionOption,
  DimensionWeights,
  RiskFactor,
  TrustCheck,
  TrustEvaluation,
  TrustOutcome,
} from '@/types';

/** Shapes returned by the JourneyOS API, as consumed by the console. */

export interface CustomerRow {
  id: string;
  name: string;
  email: string;
  loyaltyTier: string;
  loyaltyPoints: number;
  preferences?: { priority: string; preferredCabin: string; maxLayovers: number };
  journeyCount: number;
  eventCount: number;
  decisionCount: number;
  actionCount: number;
  latestEvent: { type: string; severity: string } | null;
  activeJourney: { id: string; goal: string; status: string; template: string } | null;
}

export interface ScenarioRow {
  id: string;
  label: string;
  description: string;
  eventType: string;
  expectedSeverity: string;
}

export interface JourneyDetail {
  journey: {
    id: string;
    goal: string;
    status: string;
    template: string;
    context: Record<string, unknown>;
    startedAt: string;
  };
  customer: { id: string; name: string; loyaltyTier: string } | null;  events: Array<{
    id: string;
    type: string;
    severity: string;
    source: string;
    occurredAt: string;
    correlationId: string;
  }>;
  audit: Array<{
    id: string;
    stage: string;
    actor: string;
    action: string;
    outcome: string;
    summary: string;
    occurredAt: string;
  }>;
  decisions?: Array<{ id: string; status: string; planner: string }>;
}

export interface GraphResponse {
  snapshotId: string;
  journeyId: string;
  customerId: string;
  eventId: string;
  stale: boolean;
  staleNodes: Array<{ id: string; type: string; label: string; ageSeconds: number }>;
  nodes: ContextNode[];
  edges: ContextEdge[];
  stats: { nodeCount: number; edgeCount: number; maxDepthFromJourney: number };
}

export interface TrustResponse {
  journeyId: string;
  action: { type: string; estimatedCost: number; currency: string };
  outcome: TrustOutcome;
  headline: string;
  riskScore: number;
  riskFactors: RiskFactor[];
  checks: TrustCheck[];
  failedRuleIds: string[];
  policyVersion: string;
}

export interface DecisionResponse {
  decisionId: string;
  journeyId: string;
  snapshotId: string;
  planner: string;
  model: string | null;
  promptVersion: string;
  confidence: number;
  reasoning: string;
  evidence: string[];
  weights: DimensionWeights;
  bestOption: DecisionOption;
  alternatives: DecisionOption[];
  tradeoff: TradeoffTable;
  screenedOut: Array<{ optionId: string; reason: string }>;
  trust: TrustEvaluation;
}

export interface ActionResponse {
  actionId: string;
  type: string;
  status: string;
  idempotencyKey: string;
  result: Record<string, unknown> | null;
  failureReason: string | null;
  replayed: boolean;
}

export interface ContentResponse {
  decisionId: string;
  provider: string;
  live: boolean;
  copySource: 'ai' | 'deterministic';
  model: string | null;
  promptVersion: string;
  channels: Array<{
    channel: string;
    consented: boolean;
    suppressedReason: string | null;
    message: {
      subject: string;
      body: string;
      cta: string | null;
      templateUid: string;
      templateSource: string;
      missingTokens: string[];
    } | null;
  }>;
}
