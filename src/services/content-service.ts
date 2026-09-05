import { runContentAgent, CONTENT_PROMPT_VERSION } from '@/agents';
import { applyChannelLimits, renderTemplate, type RenderedMessage } from '@/core/content';
import { AuditRecordIds, err, ok, toJsonObject, type Clock, type DecisionId, type Result } from '@/core/shared';
import type { Logger } from '@/lib/logger';
import type { Adapters, ContentChannel, ConsentChannel, Repositories } from '@/types';

export interface ComposeInput {
  readonly decisionId: DecisionId;
}

export type ContentErrorCode = 'decision_not_found' | 'journey_not_found' | 'no_templates';

export interface ContentFailure {
  readonly code: ContentErrorCode;
  readonly message: string;
}

export interface ChannelRender {
  readonly channel: ContentChannel;
  readonly consented: boolean;
  /** Why a channel was skipped, shown in the UI rather than hidden. */
  readonly suppressedReason: string | null;
  readonly message: RenderedMessage | null;
}

export interface ContentResult {
  readonly decisionId: DecisionId;
  readonly provider: string;
  readonly live: boolean;
  readonly copySource: 'ai' | 'deterministic';
  readonly model: string | null;
  readonly promptVersion: string;
  readonly channels: readonly ChannelRender[];
}

/** Channels that carry marketing-adjacent risk require an explicit grant. */
const CONSENT_FOR_CHANNEL: Partial<Record<ContentChannel, ConsentChannel>> = {
  email: 'email',
  push: 'push',
  in_app: 'in_app',
};

export interface ContentServiceDeps {
  readonly repositories: Repositories;
  readonly adapters: Adapters;
  readonly clock: Clock;
  readonly logger: Logger;
}

/**
 * Content Composer — the Experience layer.
 *
 * Renders one decision across every channel the customer has consented to.
 * Consent is enforced here, not in the template: an un-consented channel is
 * reported as suppressed with a reason rather than quietly omitted.
 */
export class ContentService {
  constructor(private readonly deps: ContentServiceDeps) {}

  async compose(input: ComposeInput): Promise<Result<ContentResult, ContentFailure>> {
    const { repositories, adapters, clock } = this.deps;

    const decision = await repositories.decisions.findById(input.decisionId);
    if (!decision) return err({ code: 'decision_not_found', message: 'No such decision.' });

    const journey = await repositories.journeys.findById(decision.journeyId);
    if (!journey) return err({ code: 'journey_not_found', message: 'No such journey.' });

    const customer = await repositories.customers.findById(journey.customerId);
    if (!customer) return err({ code: 'journey_not_found', message: 'Journey has no customer.' });

    const needsApproval = decision.trust.outcome !== 'auto_approve';
    const destination = String(journey.context.destination ?? 'your destination');

    const copy = await runContentAgent(decision, {
      customerName: customer.name.split(' ')[0] ?? customer.name,
      loyaltyTier: customer.loyaltyTier,
      destination,
      needsApproval,
    });

    const option = decision.bestOption;
    const params = option.executionParams;

    const variables: Record<string, string> = {
      customerName: customer.name.split(' ')[0] ?? customer.name,
      loyaltyTier: customer.loyaltyTier,
      brandName: 'JourneyOS Travel',
      origin: String(journey.context.origin ?? ''),
      destination,
      flightNumber: String(journey.context.flightNumber ?? params.flightNumber ?? ''),
      optionLabel: option.label,
      cabin: String(params.cabin ?? '').replace('_', ' '),
      cost: `${option.currency} ${option.estimatedCost}`,
      departAt: this.formatMoment(params.departAt),
      arriveAt: this.formatMoment(params.arriveAt),
      explanation: copy.explanation.explanation,
      approvalLine: copy.explanation.approvalLine,
      disruptionSummary: copy.explanation.disruptionSummary,
      trustOutcome: decision.trust.outcome.replace(/_/g, ' '),
      riskScore: String(decision.trust.riskScore),
      policyVersion: decision.trust.policyVersion,
    };

    const templates = await adapters.content.listTemplates(journey.template);
    if (templates.length === 0) {
      return err({ code: 'no_templates', message: `No templates found for ${journey.template}.` });
    }

    const channels: ChannelRender[] = [];

    for (const template of templates) {
      const requiredConsent = CONSENT_FOR_CHANNEL[template.channel];
      const consented =
        requiredConsent === undefined ||
        (await repositories.consents.isGranted(customer.id, requiredConsent, 'service_updates'));

      channels.push({
        channel: template.channel,
        consented,
        suppressedReason: consented
          ? null
          : `Customer has not consented to service updates on ${template.channel}.`,
        message: consented ? applyChannelLimits(renderTemplate(template, variables)) : null,
      });
    }

    await repositories.audit.append({
      id: AuditRecordIds.generate(),
      journeyId: journey.id,
      correlationId: (await repositories.events.findById(decision.eventId))!.correlationId,
      stage: 'plan',
      actor: copy.source === 'ai' ? 'ai' : 'system',
      action: 'content.composed',
      outcome: 'success',
      summary: `Rendered ${channels.filter((c) => c.consented).length} of ${channels.length} channel(s) via ${adapters.content.provider}.`,
      payload: toJsonObject({
        decisionId: decision.id,
        provider: adapters.content.provider,
        live: adapters.content.live,
        copySource: copy.source,
        suppressed: channels.filter((c) => !c.consented).map((c) => c.channel),
      }),
      occurredAt: clock.now(),
    });

    return ok({
      decisionId: decision.id,
      provider: adapters.content.provider,
      live: adapters.content.live,
      copySource: copy.source,
      model: copy.model,
      promptVersion: CONTENT_PROMPT_VERSION,
      channels,
    });
  }

  private formatMoment(value: unknown): string {
    if (typeof value !== 'string') return 'to be confirmed';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? 'to be confirmed'
      : parsed.toISOString().replace('T', ' ').slice(0, 16);
  }
}
