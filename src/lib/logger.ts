/**
 * OpenTelemetry-shaped structured logger.
 *
 * Emits single-line JSON records so every stage of the control loop
 * (event → context → trust → plan → content → action → audit) is machine
 * readable and correlatable via `correlationId` / `journeyId`.
 */

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const SEVERITY: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogAttributes = Record<string, unknown>;

export interface Logger {
  debug(message: string, attributes?: LogAttributes): void;
  info(message: string, attributes?: LogAttributes): void;
  warn(message: string, attributes?: LogAttributes): void;
  error(message: string, attributes?: LogAttributes): void;
  child(bindings: LogAttributes): Logger;
}

interface LoggerOptions {
  readonly level: LogLevel;
  readonly bindings: LogAttributes;
  readonly sink: (line: string) => void;
}

function serializeError(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

function normalize(attributes: LogAttributes): LogAttributes {
  return Object.fromEntries(Object.entries(attributes).map(([key, value]) => [key, serializeError(value)]));
}

function createLoggerWith(options: LoggerOptions): Logger {
  const emit = (level: LogLevel, message: string, attributes?: LogAttributes): void => {
    if (SEVERITY[level] < SEVERITY[options.level]) return;

    options.sink(
      JSON.stringify({
        ...normalize(options.bindings),
        ...(attributes ? normalize(attributes) : {}),
        // Reserved fields are written last so user attributes cannot clobber them.
        timestamp: new Date().toISOString(),
        severity: level.toUpperCase(),
        message,
      }),
    );
  };

  return {
    debug: (message, attributes) => emit('debug', message, attributes),
    info: (message, attributes) => emit('info', message, attributes),
    warn: (message, attributes) => emit('warn', message, attributes),
    error: (message, attributes) => emit('error', message, attributes),
    child: (bindings) => createLoggerWith({ ...options, bindings: { ...options.bindings, ...bindings } }),
  };
}

export function createLogger(
  bindings: LogAttributes = {},
  level: LogLevel = (process.env.LOG_LEVEL as LogLevel | undefined) ?? 'info',
): Logger {
  // eslint-disable-next-line no-console
  return createLoggerWith({ level, bindings, sink: (line) => console.log(line) });
}

export const logger = createLogger({ service: 'journeyos' });
