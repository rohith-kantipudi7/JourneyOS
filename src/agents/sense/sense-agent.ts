import { z } from 'zod';

import type { ContextSnapshot } from '@/types';

import { callStructured } from '../shared/structured';

export const SENSE_PROMPT_VERSION = 'sense-1.0.0';

export const problemStatementSchema = z.object({
  disruptionSummary: z.string().min(10).max(800),
  customerGoal: z.string().min(5).max(500),
  /** Non-negotiables the planner must respect, e.g. "must arrive before 20:00". */
  hardConstraints: z.array(z.string().min(3).max(300)).max(10),
  softPreferences: z.array(z.string().min(3).max(300)).max(10),
  urgency: z.enum(['low', 'medium', 'high', 'critical']),
  /** Facts pulled from the context graph that justify the framing. */
  evidence: z.array(z.string().min(3).max(400)).min(1).max(12),
});

export type ProblemStatement = z.infer<typeof problemStatementSchema>;

const SYSTEM = `You are the Sense Agent inside JourneyOS, a customer journey orchestration platform.
Your only job is to turn an event plus its context graph into a precise, structured problem statement.
You do not propose solutions. You do not take actions. You do not write prose for customers.
Respond with a single JSON object matching the required schema exactly. Every claim in "evidence" must be
traceable to the supplied context.`;

/** Compact projection of the graph — the agent sees facts, never raw records. */
export function summarizeSnapshot(snapshot: ContextSnapshot): string {
  const byType = (type: string) => snapshot.nodes.filter((node) => node.type === type);

  const lines = [
    `Journey goal: ${byType('Journey')[0]?.data.goal ?? 'unknown'}`,
    `Triggering event: ${byType('Event').find((node) => node.id === snapshot.eventId)?.label ?? 'unknown'}`,
    `Customer: ${byType('Customer')[0]?.label ?? 'unknown'} (${byType('Customer')[0]?.data.loyaltyTier ?? 'standard'})`,
    `Preferences: ${JSON.stringify(byType('Preference')[0]?.data ?? {})}`,
    `Event payload: ${JSON.stringify(byType('Event').find((n) => n.id === snapshot.eventId)?.data ?? {})}`,
    `Journey context: ${JSON.stringify(byType('Journey')[0]?.data.context ?? {})}`,
    `Prior incidents: ${JSON.stringify(byType('PriorIncidentSummary')[0]?.data ?? {})}`,
    `Granted consents: ${byType('Consent')
      .filter((node) => node.data.granted === true)
      .map((node) => `${node.data.channel}/${node.data.purpose}`)
      .join(', ')}`,
  ];

  return lines.join('\n');
}

export interface SenseResult {
  readonly statement: ProblemStatement;
  readonly source: 'ai' | 'deterministic';
  readonly model: string | null;
}

/** Deterministic framing used when the AI is unavailable or fails validation. */
export function deterministicStatement(snapshot: ContextSnapshot): ProblemStatement {
  const journey = snapshot.nodes.find((node) => node.type === 'Journey');
  const event = snapshot.nodes.find((node) => node.id === snapshot.eventId);
  const preference = snapshot.nodes.find((node) => node.type === 'Preference');
  const context = (journey?.data.context ?? {}) as Record<string, unknown>;
  const summary = snapshot.nodes.find((node) => node.type === 'PriorIncidentSummary');

  const arriveBy = typeof context.arriveBy === 'string' ? context.arriveBy : null;

  return {
    disruptionSummary: `${event?.label ?? 'A disruption'} affected the journey to ${String(context.destination ?? 'the destination')}.`,
    customerGoal: String(journey?.data.goal ?? 'Complete the journey.'),
    hardConstraints: arriveBy ? [`Must arrive by ${arriveBy}`] : [],
    softPreferences: [
      `Priority: ${String(preference?.data.priority ?? 'fastest')}`,
      `Preferred cabin: ${String(preference?.data.preferredCabin ?? 'economy')}`,
    ],
    urgency: 'high',
    evidence: [
      `Event severity ${String(event?.data.severity ?? 'unknown')}`,
      `Prior disruptions in 90 days: ${String(summary?.data.disruptionsLast90Days ?? 0)}`,
    ],
  };
}

export async function runSenseAgent(snapshot: ContextSnapshot): Promise<SenseResult> {
  const result = await callStructured({
    schema: problemStatementSchema,
    schemaName: 'ProblemStatement',
    system: SYSTEM,
    user: `Context:\n${summarizeSnapshot(snapshot)}\n\nReturn the problem statement JSON.`,
  });

  if (result.ok && result.data) {
    return { statement: result.data, source: 'ai', model: result.model ?? null };
  }

  return { statement: deterministicStatement(snapshot), source: 'deterministic', model: null };
}
