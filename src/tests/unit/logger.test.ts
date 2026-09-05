import { describe, expect, it } from 'vitest';

import { createLogger } from '@/lib/logger';

function captureLogger(level: Parameters<typeof createLogger>[1] = 'debug') {
  const lines: string[] = [];
  const logger = createLogger({ service: 'test' }, level);

  // Redirect the sink by wrapping console.log for the duration of the capture.
  const original = console.log;
  console.log = (line: string) => void lines.push(line);

  return {
    logger,
    lines,
    restore: () => {
      console.log = original;
    },
  };
}

describe('structured logger', () => {
  it('emits parseable JSON with OpenTelemetry-shaped fields', () => {
    const { logger, lines, restore } = captureLogger();
    logger.info('hello', { journeyId: 'jrn_1' });
    restore();

    const record = JSON.parse(lines[0]!);
    expect(record.severity).toBe('INFO');
    expect(record.message).toBe('hello');
    expect(record.service).toBe('test');
    expect(record.journeyId).toBe('jrn_1');
    expect(typeof record.timestamp).toBe('string');
  });

  it('does not let an attribute clobber the reserved severity field', () => {
    const { logger, lines, restore } = captureLogger();
    logger.info('event ingested', { severity: 'high', message: 'nope' });
    restore();

    const record = JSON.parse(lines[0]!);
    expect(record.severity).toBe('INFO');
    expect(record.message).toBe('event ingested');
  });

  it('suppresses records below the configured level', () => {
    const { logger, lines, restore } = captureLogger('warn');
    logger.debug('noise');
    logger.info('noise');
    logger.warn('signal');
    restore();

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!).message).toBe('signal');
  });

  it('merges child bindings into every record', () => {
    const { logger, lines, restore } = captureLogger();
    logger.child({ component: 'gateway' }).info('bound');
    restore();

    expect(JSON.parse(lines[0]!).component).toBe('gateway');
  });

  it('serializes Error attributes instead of emitting an empty object', () => {
    const { logger, lines, restore } = captureLogger();
    logger.error('failed', { cause: new Error('boom') });
    restore();

    const record = JSON.parse(lines[0]!);
    expect(record.cause.name).toBe('Error');
    expect(record.cause.message).toBe('boom');
  });
});
