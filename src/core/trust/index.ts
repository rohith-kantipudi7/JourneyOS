/**
 * Trust Kernel — the deterministic gatekeeper.
 *
 * Evaluates consent, layered policy composition, context freshness, and a
 * weighted numeric risk score to produce a tiered outcome:
 * `auto_approve` | `needs_customer_approval` | `hard_deny`.
 *
 * Hard rule: zero LLM calls, zero I/O. Inputs in, decision out. Enforced by
 * an ESLint boundary in `eslint.config.mjs`.
 */
export * from './context';
export * from './trust-kernel';
