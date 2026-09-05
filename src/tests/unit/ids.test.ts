import { describe, expect, it } from 'vitest';

import {
  ActionIds,
  CustomerIds,
  JourneyIds,
  correlationIdSchema,
  idempotencyKeyFrom,
  newCorrelationId,
} from '@/core/shared';

describe('branded identifiers', () => {
  it('generates prefixed, well-formed ids', () => {
    const id = CustomerIds.generate();
    expect(id).toMatch(/^cus_[0-9a-f]{32}$/);
    expect(CustomerIds.is(id)).toBe(true);
  });

  it('gives every entity kind a distinct prefix', () => {
    const prefixes = [CustomerIds, JourneyIds, ActionIds].map((kind) => kind.prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it('rejects an id belonging to a different entity', () => {
    const journeyId = JourneyIds.generate();

    expect(CustomerIds.is(journeyId)).toBe(false);
    expect(() => CustomerIds.parse(journeyId)).toThrow();
  });

  it('rejects malformed values', () => {
    expect(CustomerIds.is('cus_short')).toBe(false);
    expect(CustomerIds.is('')).toBe(false);
    expect(CustomerIds.is('not-an-id')).toBe(false);
  });

  it('round-trips a valid id through parse', () => {
    const id = CustomerIds.generate();
    expect(CustomerIds.parse(id)).toBe(id);
  });
});

describe('correlation ids and idempotency keys', () => {
  it('accepts externally supplied correlation ids', () => {
    expect(correlationIdSchema.parse('  amadeus-evt-9931  ')).toBe('amadeus-evt-9931');
  });

  it('rejects an empty correlation id', () => {
    expect(() => correlationIdSchema.parse('   ')).toThrow();
  });

  it('generates unique correlation ids', () => {
    expect(newCorrelationId()).not.toBe(newCorrelationId());
  });

  it('derives the same idempotency key from the same parts', () => {
    const first = idempotencyKeyFrom('dec_1', 'rebookFlight', 'AF191');
    const second = idempotencyKeyFrom('dec_1', 'rebookFlight', 'AF191');

    expect(first).toBe(second);
    expect(first).not.toBe(idempotencyKeyFrom('dec_1', 'issueVoucher', 'AF191'));
  });
});
