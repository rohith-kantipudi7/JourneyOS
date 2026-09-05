/**
 * Clock port.
 *
 * Core logic never calls `new Date()` directly — time is injected. This keeps
 * freshness checks, expiry rules, and audit timestamps deterministic in tests.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

/** Test double: always reports the same instant. */
export function fixedClock(instant: Date | string): Clock {
  const frozen = typeof instant === 'string' ? new Date(instant) : instant;
  return { now: () => new Date(frozen.getTime()) };
}

/** Test double: advances by a fixed step on every read. */
export function tickingClock(start: Date | string, stepMs = 1_000): Clock {
  let current = (typeof start === 'string' ? new Date(start) : start).getTime();
  return {
    now: () => {
      const value = new Date(current);
      current += stepMs;
      return value;
    },
  };
}
