/**
 * Typed adapters — the only way JourneyOS talks to the outside world.
 *
 * Each adapter implements a port defined in `src/types/ports/adapters.ts` and
 * is injected as a dependency, so a simulated implementation and a live one
 * are interchangeable. Agents, routes, and UI components never bypass this layer.
 */
import type { Adapters } from '@/types';

import { ContentstackAdapter } from './contentstack/contentstack.adapter';
import { SimulatedEscalationAdapter, SimulatedNotificationAdapter } from './simulated';
import { SimulatedTravelAdapter } from './travel/simulated-travel.adapter';

export * from './contentstack/contentstack.adapter';
export * from './contentstack/local-templates';
export * from './simulated';
export * from './travel/simulated-travel.adapter';

export function createSimulatedAdapters(now: () => Date = () => new Date()): Adapters {
  return {
    travel: new SimulatedTravelAdapter(now),
    notification: new SimulatedNotificationAdapter(now),
    escalation: new SimulatedEscalationAdapter(),
    content: new ContentstackAdapter(),
  };
}
