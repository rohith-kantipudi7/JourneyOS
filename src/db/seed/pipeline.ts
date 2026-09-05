import type { Database } from '../client';
import { createRepositories } from '../repositories';
import { systemClock } from '@/core/shared';
import { buildContainer } from '@/services';

import { createRng } from './random';

/**
 * Post-seed pipeline.
 *
 * Runs the real control loop over a share of the seeded population so the
 * console opens on journeys that already have a decision, a trust verdict, and
 * an audit trail — rather than requiring a click before anything exists.
 *
 * Decisions are produced with the deterministic planner: pre-baked demo data
 * must be reproducible, and the AI path stays for live operator runs.
 */
export interface PipelineOptions {
  /** Share of disrupted journeys that receive a proposed decision. */
  readonly decisionRate?: number;
  /** Share of those decisions that are also approved and executed. */
  readonly executionRate?: number;
  readonly seed?: number;
}

export interface PipelineSummary {
  readonly considered: number;
  readonly decisions: number;
  readonly executed: number;
  readonly blocked: number;
}

const OPEN_DISRUPTED = new Set(['disrupted', 'recovering']);

export async function runSeedPipeline(
  db: Database,
  options: PipelineOptions = {},
): Promise<PipelineSummary> {
  const decisionRate = options.decisionRate ?? 0.8;
  const executionRate = options.executionRate ?? 0.45;
  const rng = createRng(options.seed ?? 99_001);

  const repositories = createRepositories(db, systemClock);
  const container = buildContainer(repositories, systemClock);

  const customers = await repositories.customers.list();
  let considered = 0;
  let decisions = 0;
  let executed = 0;
  let blocked = 0;

  for (const customer of customers) {
    const journeys = await repositories.journeys.listByCustomer(customer.id);
    const target = journeys.find((journey) => OPEN_DISRUPTED.has(journey.status));
    if (!target) continue;

    const events = await repositories.events.listByJourney(target.id);
    if (events.length === 0) continue;

    considered++;
    if (!rng.chance(decisionRate)) continue;

    const planned = await container.decisions.plan({
      journeyId: target.id,
      plannerMode: 'deterministic',
    });

    if (!planned.ok) {
      // Every option blocked by policy is a legitimate outcome, not a failure.
      blocked++;
      continue;
    }

    decisions++;

    if (rng.chance(executionRate)) {
      const result = await container.actions.approveAndExecute({
        decisionId: planned.value.decision.id,
        approvedBy: rng.chance(0.8) ? 'customer' : 'human_agent',
      });
      if (result.ok) executed++;
    }
  }

  return { considered, decisions, executed, blocked };
}
