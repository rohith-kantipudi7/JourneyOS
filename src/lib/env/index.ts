import { type Capabilities, type Env, envSchema, resolveCapabilities } from './schema';

export type { Capabilities, Env };
export { envSchema, resolveCapabilities };

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'EnvValidationError';
  }
}

export type EnvSource = Record<string, string | undefined>;

export function parseEnv(source: EnvSource = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }

  return result.data;
}

let cachedEnv: Env | undefined;
let cachedCapabilities: Capabilities | undefined;

export function getEnv(): Env {
  cachedEnv ??= parseEnv();
  return cachedEnv;
}

export function getCapabilities(): Capabilities {
  cachedCapabilities ??= resolveCapabilities(getEnv());
  return cachedCapabilities;
}

/** Test-only escape hatch so suites can exercise multiple configurations. */
export function resetEnvCache(): void {
  cachedEnv = undefined;
  cachedCapabilities = undefined;
}
