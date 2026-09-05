/**
 * Application services — the composition layer.
 *
 * Services wire repositories, adapters, the Trust Kernel, and agents together
 * to run a use case end-to-end (ingest event, produce decision, execute
 * approved action). Dependencies are injected, never imported as singletons,
 * so every service is testable with in-memory fakes.
 */
export * from './action-service';
export * from './container';
export * from './content-service';
export * from './decision-service';
