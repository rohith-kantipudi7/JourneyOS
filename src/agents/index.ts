/**
 * AI agents — proposal only, never execution.
 *
 * Four skill-based agents (not a multi-agent conversation):
 *   sense/    — event + snapshot → structured problem statement
 *   planning/ — problem statement → per-dimension scores for pre-screened options
 *   content/  — approved decision → customer-facing explanation copy
 *   action/   — approved decision → typed execution plan (proposal only)
 *
 * Every prompt lives here (never inline in routes or components) and every
 * response is Zod-validated before it can influence anything downstream.
 */
export * from './content/content-agent';
export * from './planning/planning-agent';
export * from './sense/sense-agent';
export * from './shared/structured';
