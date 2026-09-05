/**
 * Declarative policy definitions consumed by the Trust Kernel.
 *
 * Policies compose via explicit AND / OR / NOT groups — for example
 * `(tier = Gold OR priorIncidents < 2) AND spend <= cap` — rather than a
 * single flat boolean. Each rule set is versioned, and that version is stamped
 * onto every evaluation so audit records show exactly which rules ran.
 *
 * Data only: no LLM calls, no I/O.
 */
export * from './expressions';
export * from './predicates';
export * from './risk-model';
export * from './rules';
