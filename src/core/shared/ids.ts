import { randomUUID } from 'node:crypto';

import { z } from 'zod';

/**
 * Branded identifiers.
 *
 * A `CustomerId` and a `JourneyId` are both strings at runtime, but the brand
 * makes them structurally incompatible at compile time — passing a journey id
 * where a customer id is expected becomes a type error, not a production bug.
 */

declare const __brand: unique symbol;

export type Branded<T, B extends string> = T & { readonly [__brand]: B };

export interface IdKind<B extends string> {
  readonly brand: B;
  readonly prefix: string;
  readonly schema: z.ZodType<Branded<string, B>>;
  generate(): Branded<string, B>;
  /** Throws if the value is not a well-formed id of this kind. */
  parse(value: string): Branded<string, B>;
  is(value: string): value is Branded<string, B>;
}

function defineId<B extends string>(brand: B, prefix: string): IdKind<B> {
  const pattern = new RegExp(`^${prefix}_[0-9a-f]{32}$`);
  const is = (value: string): value is Branded<string, B> => pattern.test(value);

  const schema = z.custom<Branded<string, B>>((value) => typeof value === 'string' && is(value), {
    message: `Expected a ${brand} of the form \`${prefix}_<32 hex chars>\``,
  });

  return {
    brand,
    prefix,
    schema,
    generate: () => `${prefix}_${randomUUID().replaceAll('-', '')}` as Branded<string, B>,
    parse: (value) => schema.parse(value),
    is,
  };
}

export const CustomerIds = defineId('CustomerId', 'cus');
export const JourneyIds = defineId('JourneyId', 'jrn');
export const EventIds = defineId('EventId', 'evt');
export const SnapshotIds = defineId('SnapshotId', 'snp');
export const DecisionIds = defineId('DecisionId', 'dec');
export const ActionIds = defineId('ActionId', 'act');
export const ConsentIds = defineId('ConsentId', 'csn');
export const AuditRecordIds = defineId('AuditRecordId', 'aud');

export type CustomerId = Branded<string, 'CustomerId'>;
export type JourneyId = Branded<string, 'JourneyId'>;
export type EventId = Branded<string, 'EventId'>;
export type SnapshotId = Branded<string, 'SnapshotId'>;
export type DecisionId = Branded<string, 'DecisionId'>;
export type ActionId = Branded<string, 'ActionId'>;
export type ConsentId = Branded<string, 'ConsentId'>;
export type AuditRecordId = Branded<string, 'AuditRecordId'>;

/**
 * Correlation ids and idempotency keys are supplied by upstream systems, so
 * they carry a brand for type safety but no JourneyOS-owned format.
 */
export type CorrelationId = Branded<string, 'CorrelationId'>;
export type IdempotencyKey = Branded<string, 'IdempotencyKey'>;

export const correlationIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .transform((value) => value as CorrelationId);

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .transform((value) => value as IdempotencyKey);

export function newCorrelationId(): CorrelationId {
  return `cor_${randomUUID().replaceAll('-', '')}` as CorrelationId;
}

/**
 * Derives a stable idempotency key from its parts, so retrying the same
 * logical action always produces the same key.
 */
export function idempotencyKeyFrom(...parts: readonly string[]): IdempotencyKey {
  return parts.map((part) => part.trim()).join(':') as IdempotencyKey;
}
