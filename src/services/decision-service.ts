import { deterministicStatement, runPlanningAgent, runSenseAgent, PLANNING_PROMPT_VERSION } from '@/agents';
import {
  buildTradeoffTable,
  fallbackReasoning,
  rankOptions,
  scoreCandidatesDeterministically,
  WEIGHTS_BY_PRIORITY,
  type ScoredCandidate,
} from '@/core/decision';
import type { JourneyContextBuilder } from '@/core/journey';
import { AuditRecordIds, DecisionIds, err, ok, toJsonObject, type Clock, type JourneyId, type Result } from '@/core/shared';
import { buildTrustContext, type TrustKernel } from '@/core/trust';
import type { Logger } from '@/lib/logger';
import type {
  Adapters,
  ContextSnapshot,
  Decision,
  DecisionOption,
  OptimizationPriority,
  RecoveryCandidate,
  Repositories,
  TravelAdapter,
} from '@/types';

export interface PlanJourneyInput {
  readonly journeyId: JourneyId;
  /** `deterministic` skips the agents entirely — used when pre-baking demo data. */
  readonly plannerMode?: 'auto' | 'deterministic';
}

export type DecisionErrorCode =
  | 'journey_not_found'
  | 'no_events'
  | 'context_build_failed'
  | 'no_viable_options';

export interface DecisionFailure {
  readonly code: DecisionErrorCode;
  readonly message: string;
  /** Options rejected by the Trust Kernel before ranking, with reasons. */
  readonly screenedOut?: readonly { optionId: string; reason: string }[];
}

export interface DecisionResult {
  readonly decision: Decision;
  readonly snapshot: ContextSnapshot;
  readonly tradeoff: ReturnType<typeof buildTradeoffTable>;
  readonly screenedOut: readonly { optionId: string; reason: string }[];
}

export interface DecisionServiceDeps {
  readonly repositories: Repositories;
  readonly contextBuilder: JourneyContextBuilder;
  readonly trustKernel: TrustKernel;
  readonly adapters: Adapters;
  readonly clock: Clock;
  readonly logger: Logger;
}

/**
 * Decision Planner — stages 4 and 5 of the control loop.
 *
 * Sense → screen candidates against the Trust Kernel → score (AI or fallback)
 * → rank deterministically → re-evaluate trust on the winner → persist.
 *
 * The AI never chooses. It supplies per-dimension scores for options that have
 * already passed policy screening; ordering is plain arithmetic.
 */
export class DecisionService {
  constructor(private readonly deps: DecisionServiceDeps) {}

  async plan(input: PlanJourneyInput): Promise<Result<DecisionResult, DecisionFailure>> {
    const { repositories, contextBuilder, trustKernel, adapters } = this.deps;
    const log = this.deps.logger.child({ component: 'decision-service', journeyId: input.journeyId });

    const journey = await repositories.journeys.findById(input.journeyId);
    if (!journey) return err({ code: 'journey_not_found', message: 'No such journey.' });

    const events = await repositories.events.listByJourney(input.journeyId);
    const triggerEvent = events.at(-1);
    if (!triggerEvent) return err({ code: 'no_events', message: 'This journey has no events yet.' });

    const captured = await contextBuilder.capture({
      journeyId: input.journeyId,
      eventId: triggerEvent.id,
    });
    if (!captured.ok) {
      return err({ code: 'context_build_failed', message: captured.error.message });
    }
    const snapshot = captured.value;

    const candidates = await this.searchCandidates(adapters.travel, snapshot, journey.context);

    // Hard constraints are applied BEFORE ranking, not as a post-hoc rejection.
    const { viable, screenedOut } = this.screenCandidates(snapshot, candidates, trustKernel);

    if (viable.length === 0) {
      return err({
        code: 'no_viable_options',
        message: 'Every recovery option was blocked by the Trust Kernel.',
        screenedOut,
      });
    }

    const priority = this.priorityFor(snapshot);
    const weights = WEIGHTS_BY_PRIORITY[priority];

    const useAgents = input.plannerMode !== 'deterministic';
    const sense = useAgents
      ? await runSenseAgent(snapshot)
      : { statement: deterministicStatement(snapshot), source: 'deterministic' as const, model: null };
    const planned = useAgents
      ? await runPlanningAgent(sense.statement, viable)
      : { plan: null, source: 'deterministic' as const, model: null, rejectionReason: null };

    const deterministic = scoreCandidatesDeterministically(viable);
    let scored: ScoredCandidate[] = deterministic;
    let planner: Decision['planner'] = 'deterministic_fallback';
    let reasoning = '';
    let confidence = 0.62;
    let model: string | null = null;

    if (planned.plan) {
      const byId = new Map(planned.plan.options.map((option) => [option.optionId, option]));
      scored = deterministic.map((candidate) => {
        const fromAi = byId.get(candidate.optionId);
        return fromAi
          ? { ...candidate, scores: fromAi.scores, evidence: fromAi.evidence }
          : candidate;
      });
      planner = 'ai';
      reasoning = planned.plan.reasoning;
      confidence = planned.plan.confidence;
      model = planned.model;
    }

    const ranked = rankOptions(scored, weights);
    const [best, ...alternatives] = ranked as [DecisionOption, ...DecisionOption[]];

    // The fallback explanation must name the option that actually won the ranking.
    if (!planned.plan) reasoning = fallbackReasoning(best, priority);

    const trust = trustKernel.evaluate(
      buildTrustContext(snapshot, {
        type: best.actionType,
        estimatedCost: best.estimatedCost,
        currency: best.currency,
      }),
    );

    const decision = await repositories.decisions.create({
      id: DecisionIds.generate(),
      journeyId: journey.id,
      eventId: triggerEvent.id,
      snapshotId: snapshot.id,
      status: 'proposed',
      planner,
      model,
      promptVersion: PLANNING_PROMPT_VERSION,
      weights,
      bestOption: best,
      alternatives,
      confidence,
      reasoning,
      evidence: sense.statement.evidence,
      trust,
    });

    await this.recordAudit(decision, snapshot, triggerEvent.correlationId, {
      planner,
      model,
      senseSource: sense.source,
      rejectionReason: planned.rejectionReason,
      screenedOut: screenedOut.length,
      optionCount: ranked.length,
    });

    log.info('decision proposed', {
      decisionId: decision.id,
      planner,
      bestOption: best.optionId,
      trustOutcome: trust.outcome,
      riskScore: trust.riskScore,
    });

    return ok({
      decision,
      snapshot,
      tradeoff: buildTradeoffTable(best, alternatives, weights),
      screenedOut,
    });
  }

  private async searchCandidates(
    travel: TravelAdapter,
    snapshot: ContextSnapshot,
    journeyContext: Record<string, unknown>,
  ): Promise<RecoveryCandidate[]> {
    const preference = snapshot.nodes.find((node) => node.type === 'Preference');

    return travel.searchAlternatives({
      origin: String(journeyContext.origin ?? 'BLR'),
      destination: String(journeyContext.destination ?? 'CDG'),
      notBefore: snapshot.builtAt.toISOString(),
      arriveBy: typeof journeyContext.arriveBy === 'string' ? journeyContext.arriveBy : null,
      preferredCabin: (preference?.data.preferredCabin as RecoveryCandidate['cabin']) ?? 'economy',
      passengerCount: Number(journeyContext.passengerCount ?? 1),
      maxLayovers: Number(preference?.data.maxLayovers ?? 2),
      preferredCarriers: (preference?.data.preferredAirlines as string[]) ?? [],
    });
  }

  /** Rejects options the Trust Kernel would hard-deny, before they are ranked. */
  private screenCandidates(
    snapshot: ContextSnapshot,
    candidates: readonly RecoveryCandidate[],
    trustKernel: TrustKernel,
  ): { viable: RecoveryCandidate[]; screenedOut: { optionId: string; reason: string }[] } {
    const viable: RecoveryCandidate[] = [];
    const screenedOut: { optionId: string; reason: string }[] = [];

    for (const candidate of candidates) {
      const verdict = trustKernel.evaluate(
        buildTrustContext(snapshot, {
          type: candidate.actionType,
          estimatedCost: candidate.cost,
          currency: candidate.currency,
        }),
      );

      if (verdict.outcome === 'hard_deny') {
        screenedOut.push({ optionId: candidate.id, reason: verdict.headline });
      } else {
        viable.push(candidate);
      }
    }

    return { viable, screenedOut };
  }

  private priorityFor(snapshot: ContextSnapshot): OptimizationPriority {
    const preference = snapshot.nodes.find((node) => node.type === 'Preference');
    const priority = preference?.data.priority;
    return typeof priority === 'string' && priority in WEIGHTS_BY_PRIORITY
      ? (priority as OptimizationPriority)
      : 'fastest';
  }

  private async recordAudit(
    decision: Decision,
    snapshot: ContextSnapshot,
    correlationId: Parameters<Repositories['audit']['append']>[0]['correlationId'],
    detail: Record<string, unknown>,
  ): Promise<void> {
    const { repositories, clock } = this.deps;

    await repositories.audit.append({
      id: AuditRecordIds.generate(),
      journeyId: decision.journeyId,
      correlationId,
      stage: 'plan',
      actor: decision.planner === 'ai' ? 'ai' : 'system',
      action: `plan.${decision.planner}`,
      outcome: 'success',
      summary: `Proposed "${decision.bestOption.label}" with ${decision.alternatives.length} alternative(s).`,
      payload: toJsonObject({ decisionId: decision.id, snapshotId: snapshot.id, ...detail }),
      occurredAt: clock.now(),
    });

    await repositories.audit.append({
      id: AuditRecordIds.generate(),
      journeyId: decision.journeyId,
      correlationId,
      stage: 'validate',
      actor: 'trust_kernel',
      action: 'trust.evaluate',
      outcome: decision.trust.outcome === 'hard_deny' ? 'denied' : 'success',
      summary: `Trust outcome ${decision.trust.outcome} at risk ${decision.trust.riskScore}/100.`,
      payload: toJsonObject({
        decisionId: decision.id,
        outcome: decision.trust.outcome,
        riskScore: decision.trust.riskScore,
        policyVersion: decision.trust.policyVersion,
      }),
      occurredAt: clock.now(),
    });
  }
}
