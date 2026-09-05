/**
 * Event Gateway — validated, idempotent ingestion of business events.
 *
 * `schemas/` holds one Zod schema per event type (FlightCancelled,
 * FlightDelayed, GateChanged, HotelIssue, OrderDelayed, CustomerComplaint).
 * `gateway/` handles correlation-id deduplication and journey attachment.
 */
export * from './gateway';
export * from './schemas';
