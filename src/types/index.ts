/**
 * Shared domain interfaces — one canonical type per entity.
 *
 * Customer · Journey · JourneyEvent · Decision · Action · Consent ·
 * AuditRecord · ContextSnapshot, plus the repository ports in `ports/`.
 *
 * No duplicate models anywhere else in the codebase.
 */
export * from './action';
export * from './audit';
export * from './consent';
export * from './customer';
export * from './decision';
export * from './event';
export * from './journey';
export * from './snapshot';
export * from './trust';
export * from './ports/repositories';
export * from './ports/adapters';
