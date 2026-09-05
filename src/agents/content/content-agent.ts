import { z } from 'zod';

import type { Decision } from '@/types';

import { callStructured } from '../shared/structured';

export const CONTENT_PROMPT_VERSION = 'content-1.0.0';

export const explanationSchema = z.object({
  /** One or two sentences a traveller reads on their phone. */
  explanation: z.string().min(20).max(700),
  /** What the customer is being asked to do, if anything. */
  approvalLine: z.string().min(10).max(300),
  /** Short, factual disruption recap. Never speculative. */
  disruptionSummary: z.string().min(10).max(500),
});

export type Explanation = z.infer<typeof explanationSchema>;

const SYSTEM = `You are the Content Agent inside JourneyOS.
You write short, factual, reassuring copy for a traveller whose journey has been disrupted.

Rules:
- Never invent facts. Use only the supplied decision details.
- Never promise anything the system has not already secured.
- Do not apologise more than once.
- Plain language, no marketing tone, no exclamation marks.
- If the decision requires customer approval, say so plainly.`;

export interface ExplanationResult {
  readonly explanation: Explanation;
  readonly source: 'ai' | 'deterministic';
  readonly model: string | null;
}

/** Deterministic copy used when the AI is unavailable or fails validation. */
export function deterministicExplanation(decision: Decision, needsApproval: boolean): Explanation {
  const option = decision.bestOption;

  return {
    explanation:
      `We selected ${option.label} because it scored highest against your stated priorities ` +
      `(${option.evidence[0] ?? 'availability and timing'}).`,
    approvalLine: needsApproval
      ? 'Please confirm and we will complete the booking straight away.'
      : 'No action is needed from you — this has been arranged.',
    disruptionSummary: decision.reasoning.slice(0, 280),
  };
}

export async function runContentAgent(
  decision: Decision,
  context: { customerName: string; loyaltyTier: string; destination: string; needsApproval: boolean },
): Promise<ExplanationResult> {
  const option = decision.bestOption;

  const result = await callStructured({
    schema: explanationSchema,
    schemaName: 'Explanation',
    system: SYSTEM,
    temperature: 0.4,
    user: [
      `Customer: ${context.customerName} (${context.loyaltyTier} tier)`,
      `Destination: ${context.destination}`,
      `Recommended option: ${option.label} — ${option.summary}`,
      `Cost: ${option.estimatedCost} ${option.currency}`,
      `Supporting facts: ${option.evidence.join('; ')}`,
      `Planner rationale: ${decision.reasoning}`,
      `Requires customer approval: ${context.needsApproval ? 'yes' : 'no'}`,
      '',
      'Write the copy JSON.',
    ].join('\n'),
  });

  if (result.ok && result.data) {
    return { explanation: result.data, source: 'ai', model: result.model ?? null };
  }

  return {
    explanation: deterministicExplanation(decision, context.needsApproval),
    source: 'deterministic',
    model: null,
  };
}
