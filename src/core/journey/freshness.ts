import type { Provenance } from '@/types';

/**
 * How long data from each source system stays usable.
 *
 * Freshness is not cosmetic: the Trust Kernel refuses to authorize an action
 * built on stale inventory, so these budgets are a real safety control.
 * Each budget answers one question — would acting on data this old be unsafe?
 * Travel inventory expires fastest because fares and seat counts move in
 * minutes; profile and consent data change rarely, so a long budget is honest.
 */
const DAY = 24 * 60 * 60;

export const FRESHNESS_BUDGET_SECONDS = {
  crm: 30 * DAY,
  journey_store: 7 * DAY,
  /**
   * A disruption notice is a durable fact, not perishable data: a cancelled
   * flight is still cancelled hours later and still needs acting on. What
   * genuinely expires is the inventory you would rebook onto, below.
   */
  event_store: 12 * 60 * 60,
  consent_store: 365 * DAY,
  /** Fares and seat counts move in minutes — this is the real safety control. */
  travel_inventory: 5 * 60,
  derived: 5 * 60,
  /** Historical records are archival by nature; age is the point, not a defect. */
  archive: 100 * 365 * DAY,
} as const;

export type ContextSource = keyof typeof FRESHNESS_BUDGET_SECONDS;

/**
 * `observedAt` is when the underlying record last changed; `retrievedAt` is
 * when JourneyOS read it. Age is measured from the former, so re-reading stale
 * data does not make it look fresh.
 */
export function provenanceFor(source: ContextSource, observedAt: Date, now: Date): Provenance {
  const ageSeconds = Math.max(0, Math.floor((now.getTime() - observedAt.getTime()) / 1000));

  return {
    sourceSystem: source,
    retrievedAt: now,
    stale: ageSeconds > FRESHNESS_BUDGET_SECONDS[source],
    ageSeconds,
  };
}
