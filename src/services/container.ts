import { createSimulatedAdapters } from '@/adapters';
import { JourneyContextBuilder } from '@/core/journey';
import { systemClock, type Clock } from '@/core/shared';
import { TrustKernel } from '@/core/trust';
import { createRepositories, getDatabaseConnection } from '@/db';
import { EventGateway } from '@/events';
import { logger } from '@/lib/logger';
import type { Adapters, Repositories } from '@/types';

import { ActionService } from './action-service';
import { ContentService } from './content-service';
import { DecisionService } from './decision-service';

/**
 * Composition root.
 *
 * The single place that wires concrete implementations together. Route
 * handlers resolve dependencies from here; everything else receives them by
 * injection so tests can substitute fakes.
 */
export interface ServiceContainer {
  readonly repositories: Repositories;
  readonly adapters: Adapters;
  readonly eventGateway: EventGateway;
  readonly contextBuilder: JourneyContextBuilder;
  readonly trustKernel: TrustKernel;
  readonly decisions: DecisionService;
  readonly actions: ActionService;
  readonly content: ContentService;
  readonly clock: Clock;
}

export function buildContainer(
  repositories: Repositories,
  clock: Clock = systemClock,
  adapters: Adapters = createSimulatedAdapters(() => clock.now()),
): ServiceContainer {
  const contextBuilder = new JourneyContextBuilder({ repositories, clock, logger });
  const trustKernel = new TrustKernel();
  const shared = { repositories, contextBuilder, trustKernel, adapters, clock, logger };

  return {
    repositories,
    adapters,
    clock,
    contextBuilder,
    trustKernel,
    eventGateway: new EventGateway({ repositories, clock, logger }),
    decisions: new DecisionService(shared),
    actions: new ActionService(shared),
    content: new ContentService({ repositories, adapters, clock, logger }),
  };
}

let container: ServiceContainer | undefined;

/** Process-wide container backed by the real database. */
export function getContainer(): ServiceContainer {
  if (!container) {
    const { db } = getDatabaseConnection();
    container = buildContainer(createRepositories(db, systemClock), systemClock);
  }
  return container;
}
