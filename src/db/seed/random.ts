/**
 * Deterministic pseudo-random source.
 *
 * The demo dataset must be reproducible: the same seed always produces the
 * same population, so a screenshot, a test, and a live run all agree.
 */
export interface Rng {
  next(): number;
  int(minInclusive: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
  sample<T>(items: readonly T[], count: number): T[];
  chance(probability: number): boolean;
  weighted<T>(entries: ReadonlyArray<readonly [T, number]>): T;
}

/** mulberry32 — small, fast, and good enough for fixture generation. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));

  const pick = <T,>(items: readonly T[]): T => items[int(0, items.length - 1)]!;

  return {
    next,
    int,
    pick,
    chance: (probability) => next() < probability,
    sample: <T,>(items: readonly T[], count: number): T[] => {
      const pool = [...items];
      const taken: T[] = [];
      for (let i = 0; i < count && pool.length > 0; i++) {
        taken.push(pool.splice(int(0, pool.length - 1), 1)[0]!);
      }
      return taken;
    },
    weighted: <T,>(entries: ReadonlyArray<readonly [T, number]>): T => {
      const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
      let threshold = next() * total;
      for (const [value, weight] of entries) {
        threshold -= weight;
        if (threshold <= 0) return value;
      }
      return entries[entries.length - 1]![0];
    },
  };
}
