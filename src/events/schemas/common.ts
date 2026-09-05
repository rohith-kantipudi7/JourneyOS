import { z } from 'zod';

import { CustomerIds, JourneyIds, correlationIdSchema } from '@/core/shared';
import { EVENT_SEVERITIES } from '@/types';

/**
 * Accepts an ISO 8601 string and yields a `Date`, with an explicit message so
 * a malformed timestamp produces a usable field error rather than "Invalid date".
 */
export const isoDateTime = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Expected an ISO 8601 date-time string',
  })
  .transform((value) => new Date(value));

/** Fields every inbound event carries, regardless of type. */
export const eventEnvelopeSchema = z.object({
  customerId: CustomerIds.schema,
  /** Optional: when omitted the gateway resolves or creates the journey. */
  journeyId: JourneyIds.schema.nullish(),
  correlationId: correlationIdSchema,
  source: z.string().trim().min(1).max(120).default('external'),
  /** Optional: derived deterministically from the payload when omitted. */
  severity: z.enum(EVENT_SEVERITIES).optional(),
  occurredAt: isoDateTime,
});

/** Builds a complete inbound event schema for one event type. */
export function defineEventSchema<T extends string, P extends z.ZodTypeAny>(type: T, payload: P) {
  return eventEnvelopeSchema.extend({
    type: z.literal(type),
    payload,
  });
}

/** Groups Zod issues by dotted field path for a `400` response body. */
export function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_root';
    (fieldErrors[key] ??= []).push(issue.message);
  }

  return fieldErrors;
}
