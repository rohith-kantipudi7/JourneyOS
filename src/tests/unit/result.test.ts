import { describe, expect, it } from 'vitest';

import {
  andThen,
  attempt,
  collect,
  err,
  isErr,
  isOk,
  map,
  mapErr,
  ok,
  unwrap,
  unwrapOr,
  type Result,
} from '@/core/shared';

describe('Result', () => {
  it('narrows to the success branch', () => {
    const result: Result<number, string> = ok(42);
    expect(isOk(result)).toBe(true);
    expect(isErr(result)).toBe(false);
    if (result.ok) expect(result.value).toBe(42);
  });

  it('narrows to the failure branch', () => {
    const result: Result<number, string> = err('boom');
    expect(isErr(result)).toBe(true);
    if (!result.ok) expect(result.error).toBe('boom');
  });

  it('maps values but leaves errors untouched', () => {
    expect(map(ok(2), (n) => n * 5)).toEqual(ok(10));
    expect(map(err<string>('bad'), (n: number) => n * 5)).toEqual(err('bad'));
  });

  it('maps errors but leaves values untouched', () => {
    expect(mapErr(err('bad'), (e) => e.toUpperCase())).toEqual(err('BAD'));
    expect(mapErr(ok(1), (e: string) => e.toUpperCase())).toEqual(ok(1));
  });

  it('short-circuits a chain on the first failure', () => {
    const doubled = (n: number): Result<number, string> => ok(n * 2);
    const failing = (): Result<number, string> => err('stopped');

    expect(andThen(andThen(ok(3), doubled), doubled)).toEqual(ok(12));
    expect(andThen(andThen(ok(3), failing), doubled)).toEqual(err('stopped'));
  });

  it('collects many results, failing on the first error', () => {
    expect(collect([ok(1), ok(2), ok(3)])).toEqual(ok([1, 2, 3]));
    expect(collect([ok(1), err('nope'), ok(3)])).toEqual(err('nope'));
  });

  it('unwraps with and without a fallback', () => {
    expect(unwrapOr(ok(7), 0)).toBe(7);
    expect(unwrapOr(err<string>('x'), 0)).toBe(0);
    expect(unwrap(ok('value'))).toBe('value');
    expect(() => unwrap(err(new Error('exploded')))).toThrow('exploded');
  });

  it('captures thrown errors into the failure branch', () => {
    const result = attempt(() => {
      throw new Error('threw');
    });

    expect(isErr(result)).toBe(true);
    if (!result.ok) expect(result.error.message).toBe('threw');
  });
});
