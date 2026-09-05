import type { JsonObject } from '@/core/shared';
import type { Journey, JourneyEvent, PriorIncidentSummary } from '@/types';

export type { PriorIncidentSummary };

const DAY_MS = 24 * 60 * 60 * 1000;

const DISRUPTION_EVENT_TYPES = new Set(['FlightCancelled', 'FlightDelayed', 'HotelIssue', 'OrderDelayed']);

interface CompensationRecord {
  readonly amountEur: number;
  readonly issuedAt: Date;
}

function readDisrupted(context: JsonObject): boolean {
  return context.disrupted === true;
}

/** Journey context is untyped JSON by design, so read defensively. */
function readCompensation(context: JsonObject): CompensationRecord | null {
  const raw = context.compensationIssued;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;

  const amount = raw.amountEur;
  const issued = raw.issuedAt;
  if (typeof amount !== 'number' || typeof issued !== 'string') return null;

  const issuedAt = new Date(issued);
  return Number.isNaN(issuedAt.getTime()) ? null : { amountEur: amount, issuedAt };
}

const withinDays = (moment: Date, now: Date, days: number): boolean =>
  now.getTime() - moment.getTime() <= days * DAY_MS;

export function summarizePriorIncidents(
  history: readonly Journey[],
  historicalEvents: readonly JourneyEvent[],
  now: Date,
): PriorIncidentSummary {
  const disrupted = history.filter((journey) => readDisrupted(journey.context));
  const disruptedLast90 = disrupted.filter((journey) => withinDays(journey.startedAt, now, 90));

  const compensations = history
    .map((journey) => readCompensation(journey.context))
    .filter((record): record is CompensationRecord => record !== null);

  const compensationsLast90 = compensations.filter((record) => withinDays(record.issuedAt, now, 90));

  const disruptionEvents = historicalEvents.filter(
    (event) => DISRUPTION_EVENT_TYPES.has(event.type) && withinDays(event.occurredAt, now, 90),
  );

  const incidentMoments = [
    ...disrupted.map((journey) => journey.startedAt.getTime()),
    ...disruptionEvents.map((event) => event.occurredAt.getTime()),
  ];

  const mostRecentIncident = incidentMoments.length > 0 ? Math.max(...incidentMoments) : null;

  return {
    totalPriorJourneys: history.length,
    disruptedJourneys: disrupted.length,
    disruptionsLast90Days: disruptedLast90.length,
    disruptionEventsLast90Days: disruptionEvents.length,
    compensationEventsLast90Days: compensationsLast90.length,
    compensationTotalEurLast90Days: compensationsLast90.reduce((sum, r) => sum + r.amountEur, 0),
    compensationWithin30Days: compensations.some((record) => withinDays(record.issuedAt, now, 30)),
    daysSinceLastIncident:
      mostRecentIncident === null ? null : Math.floor((now.getTime() - mostRecentIncident) / DAY_MS),
    repeatDisruptionRate: history.length === 0 ? 0 : disrupted.length / history.length,
  };
}

/**
 * The history-derived portion of the risk score, 0–100.
 *
 * Kept deterministic and separate so Phase 4 can compose it with spend, tier,
 * and freshness factors — and so a test can prove that history alone moves the
 * number.
 */
export function contextRiskContribution(summary: PriorIncidentSummary): number {
  let score = 0;

  // Repeat disruptions signal an at-risk relationship, not just bad luck.
  score += Math.min(summary.disruptionsLast90Days, 3) * 15;

  // Recent compensation raises the bar for issuing more.
  if (summary.compensationWithin30Days) score += 25;
  else if (summary.compensationEventsLast90Days > 0) score += 10;

  score += Math.round(summary.repeatDisruptionRate * 15);

  // A fresh wound counts for more than an old one.
  if (summary.daysSinceLastIncident !== null && summary.daysSinceLastIncident <= 30) score += 10;

  return Math.min(score, 100);
}
