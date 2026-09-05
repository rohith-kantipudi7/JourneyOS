/**
 * Deterministic decision scoring.
 *
 * The AI proposes per-dimension scores; this module applies the weighting model
 * and computes the final ranking in plain TypeScript. Identical scores must
 * always produce an identical ranking — the reasoning is reproducible, never
 * re-prompted.
 */
export * from './fallback-planner';
export * from './scoring';
export * from './tradeoff';
