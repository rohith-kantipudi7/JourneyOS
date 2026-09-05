import {
  ActionIds,
  AuditRecordIds,
  err,
  idempotencyKeyFrom,
  ok,
  toJsonObject,
  type Clock,
  type DecisionId,
  type JsonObject,
  type Result,
} from '@/core/shared';
import { buildTrustContext, type TrustKernel } from '@/core/trust';
import type { JourneyContextBuilder } from '@/core/journey';
import type { Logger } from '@/lib/logger';
import type { Action, ActionActor, Adapters, DecisionOption, Repositories } from '@/types';

export interface ExecuteInput {
  readonly decisionId: DecisionId;
  /** Defaults to the recommended option. */
  readonly optionId?: string;
  readonly approvedBy: ActionActor;
}

export type ActionErrorCode =
  | 'decision_not_found'
  | 'option_not_found'
  | 'not_approved'
  | 'trust_denied'
  | 'execution_failed';

export interface ActionFailure {
  readonly code: ActionErrorCode;
  readonly message: string;
  readonly trustOutcome?: string;
}

export interface ActionResult {
  readonly action: Action;
  /** True when the idempotency key matched an existing action. */
  readonly replayed: boolean;
}

export interface ActionServiceDeps {
  readonly repositories: Repositories;
  readonly contextBuilder: JourneyContextBuilder;
  readonly trustKernel: TrustKernel;
  readonly adapters: Adapters;
  readonly clock: Clock;
  readonly logger: Logger;
}

/**
 * Action Runtime — stages 6, 7 and 8 of the control loop.
 *
 * Nothing executes without a recorded approval, a fresh Trust Kernel verdict,
 * and an idempotency key. The kernel is re-run at execution time because the
 * context may have moved since the proposal was made.
 */
export class ActionService {
  constructor(private readonly deps: ActionServiceDeps) {}

  async approveAndExecute(input: ExecuteInput): Promise<Result<ActionResult, ActionFailure>> {
    const { repositories, trustKernel, contextBuilder, adapters, clock } = this.deps;
    const log = this.deps.logger.child({ component: 'action-service', decisionId: input.decisionId });

    const decision = await repositories.decisions.findById(input.decisionId);
    if (!decision) return err({ code: 'decision_not_found', message: 'No such decision.' });

    const option = this.resolveOption(decision.bestOption, decision.alternatives, input.optionId);
    if (!option) return err({ code: 'option_not_found', message: 'No such option on this decision.' });

    // Same decision + option always yields the same key, so retries are safe.
    const idempotencyKey = idempotencyKeyFrom(decision.id, option.optionId, option.actionType);
    const existing = await repositories.actions.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      log.warn('duplicate action suppressed', { actionId: existing.id, idempotencyKey });
      return ok({ action: existing, replayed: true });
    }

    // Re-evaluate trust against current context, not the proposal-time verdict.
    const rebuilt = await contextBuilder.build({
      journeyId: decision.journeyId,
      eventId: decision.eventId,
    });
    if (!rebuilt.ok) {
      return err({ code: 'execution_failed', message: rebuilt.error.message });
    }

    const verdict = trustKernel.evaluate(
      buildTrustContext(rebuilt.value, {
        type: option.actionType,
        estimatedCost: option.estimatedCost,
        currency: option.currency,
      }),
    );

    if (verdict.outcome === 'hard_deny') {
      await this.audit(decision, 'execute', 'trust_kernel', 'action.blocked', 'denied', verdict.headline, {
        optionId: option.optionId,
        riskScore: verdict.riskScore,
      });

      const escalation = await adapters.escalation.escalate({
        journeyRef: decision.journeyId,
        reason: verdict.headline,
        priority: 'high',
      });

      await this.audit(
        decision,
        'execute',
        'adapter',
        'action.escalated_human',
        'success',
        `Escalated to a human agent: ${escalation.caseId} on ${escalation.queue}.`,
        { caseId: escalation.caseId },
      );

      return err({
        code: 'trust_denied',
        message: verdict.headline,
        trustOutcome: verdict.outcome,
      });
    }

    const action = await repositories.actions.create({
      id: ActionIds.generate(),
      decisionId: decision.id,
      journeyId: decision.journeyId,
      type: option.actionType,
      status: 'pending_approval',
      idempotencyKey,
      request: toJsonObject(option.executionParams),
    });

    await repositories.actions.markApproved(action.id, input.approvedBy, clock.now());
    await this.audit(
      decision,
      'approval',
      input.approvedBy === 'customer' ? 'customer' : 'human_agent',
      'action.approved',
      'success',
      `${input.approvedBy} approved "${option.label}".`,
      { actionId: action.id, optionId: option.optionId },
    );

    await repositories.decisions.updateStatus(decision.id, 'approved', clock.now());
    await repositories.actions.markStatus(action.id, 'executing');

    try {
      const result = await this.dispatch(option, decision.journeyId);
      const executed = await repositories.actions.markExecuted(action.id, result, clock.now());

      await this.audit(
        decision,
        'execute',
        'adapter',
        `action.${option.actionType}`,
        'success',
        `Executed "${option.label}" via ${adapters.travel.provider}.`,
        { actionId: action.id, ...result },
      );

      await repositories.journeys.updateStatus(decision.journeyId, 'recovering');

      log.info('action executed', { actionId: action.id, type: option.actionType });
      return ok({ action: executed, replayed: false });
    } catch (caught) {
      const reason = caught instanceof Error ? caught.message : String(caught);
      const failed = await repositories.actions.markFailed(action.id, reason);

      await this.audit(decision, 'execute', 'adapter', `action.${option.actionType}`, 'failure', reason, {
        actionId: action.id,
      });

      return ok({ action: failed, replayed: false });
    }
  }

  private resolveOption(
    best: DecisionOption,
    alternatives: readonly DecisionOption[],
    optionId?: string,
  ): DecisionOption | undefined {
    if (!optionId) return best;
    return [best, ...alternatives].find((option) => option.optionId === optionId);
  }

  private async dispatch(option: DecisionOption, journeyRef: string): Promise<JsonObject> {
    const { travel, notification } = this.deps.adapters;
    const params = option.executionParams;

    switch (option.actionType) {
      case 'rebookFlight':
        return toJsonObject(
          await travel.rebook({
            bookingReference: String(params.bookingReference ?? journeyRef.slice(-6).toUpperCase()),
            candidateId: option.optionId,
            flightNumber: String(params.flightNumber ?? 'AF193'),
            cabin: (params.cabin as DecisionOption['executionParams']['cabin']) ?? 'economy',
            passengerCount: Number(params.passengerCount ?? 1),
          } as never),
        );

      case 'issueVoucher':
        return toJsonObject(
          await travel.issueVoucher({
            customerRef: journeyRef,
            amount: option.estimatedCost,
            currency: option.currency,
          }),
        );

      case 'reserveHotel':
        return toJsonObject(
          await travel.reserveHotel({
            city: String(params.destination ?? 'CDG'),
            nights: Number(params.nights ?? 1),
            guests: Number(params.passengerCount ?? 1),
          }),
        );

      case 'sendNotification':
        return toJsonObject(
          await notification.send({
            channel: String(params.channel ?? 'email'),
            to: String(params.to ?? 'customer@journeyos.dev'),
            subject: option.label,
            body: option.summary,
          }),
        );

      default:
        return toJsonObject({ acknowledged: true, actionType: option.actionType });
    }
  }

  private async audit(
    decision: { id: string; journeyId: Parameters<Repositories['audit']['append']>[0]['journeyId']; eventId: string },
    stage: Parameters<Repositories['audit']['append']>[0]['stage'],
    actor: Parameters<Repositories['audit']['append']>[0]['actor'],
    action: string,
    outcome: Parameters<Repositories['audit']['append']>[0]['outcome'],
    summary: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const { repositories, clock } = this.deps;
    const event = await repositories.events.findById(decision.eventId as never);

    await repositories.audit.append({
      id: AuditRecordIds.generate(),
      journeyId: decision.journeyId,
      correlationId: event!.correlationId,
      stage,
      actor,
      action,
      outcome,
      summary,
      payload: toJsonObject({ decisionId: decision.id, ...payload }),
      occurredAt: clock.now(),
    });
  }
}
