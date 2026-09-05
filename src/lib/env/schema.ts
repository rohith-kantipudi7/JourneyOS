import { z } from 'zod';

/**
 * Treat empty strings from `.env` as absent, so a declared-but-blank variable
 * correctly activates the deterministic fallback path instead of failing validation.
 */
const optionalSecret = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(1).optional(),
);

export const envSchema = z.object({
  // Runtime
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Persistence
  DATABASE_URL: z.string().min(1).default('file:./data/journeyos.db'),
  DATABASE_AUTH_TOKEN: optionalSecret,

  // Decision Planner (AI)
  // Either a direct OpenAI key or an Azure OpenAI deployment satisfies this.
  OPENAI_API_KEY: optionalSecret,
  OPENAI_MODEL: z.string().min(1).default('gpt-4o-mini'),

  AZURE_OPENAI_ENDPOINT: optionalSecret,
  AZURE_OPENAI_API_KEY: optionalSecret,
  AZURE_OPENAI_DEPLOYMENT: optionalSecret,
  AZURE_OPENAI_API_VERSION: z.string().min(1).default('2025-01-01-preview'),

  // Content Composer (Contentstack)
  CONTENTSTACK_API_KEY: optionalSecret,
  CONTENTSTACK_DELIVERY_TOKEN: optionalSecret,
  CONTENTSTACK_ENVIRONMENT: z.string().min(1).default('development'),
  CONTENTSTACK_REGION: z.string().min(1).default('us'),

  // Travel adapter (Amadeus-shaped)
  AMADEUS_API_KEY: optionalSecret,
  AMADEUS_API_SECRET: optionalSecret,
  AMADEUS_BASE_URL: z.string().url().default('https://test.api.amadeus.com'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Which external systems are actually reachable with the current configuration.
 * Every `false` here has a documented deterministic fallback — JourneyOS must
 * run end-to-end with zero credentials.
 */
export interface Capabilities {
  readonly ai: boolean;
  /** Which provider backs the Decision Planner, if any. */
  readonly aiProvider: 'azure' | 'openai' | null;
  readonly contentstack: boolean;
  readonly amadeus: boolean;
}

export function resolveCapabilities(env: Env): Capabilities {
  const azure = Boolean(env.AZURE_OPENAI_ENDPOINT && env.AZURE_OPENAI_API_KEY && env.AZURE_OPENAI_DEPLOYMENT);
  const openai = Boolean(env.OPENAI_API_KEY);

  return {
    ai: azure || openai,
    aiProvider: azure ? 'azure' : openai ? 'openai' : null,
    contentstack: Boolean(env.CONTENTSTACK_API_KEY && env.CONTENTSTACK_DELIVERY_TOKEN),
    amadeus: Boolean(env.AMADEUS_API_KEY && env.AMADEUS_API_SECRET),
  };
}
