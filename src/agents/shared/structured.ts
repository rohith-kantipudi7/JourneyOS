import OpenAI from 'openai';
import { z } from 'zod';

import { getCapabilities, getEnv } from '@/lib/env';
import { logger } from '@/lib/logger';

/**
 * Structured-output helper.
 *
 * Every agent call goes through here so provider selection, validation,
 * timeout, and failure handling are uniform. A response that does not match
 * its schema is rejected outright — never coerced, never partially trusted.
 */

export interface StructuredCallResult<T> {
  readonly ok: boolean;
  readonly data?: T;
  readonly model?: string;
  readonly failure?: 'unavailable' | 'request_failed' | 'schema_mismatch' | 'empty_response';
  readonly detail?: string;
}

interface Provider {
  readonly client: OpenAI;
  /** For Azure this is the deployment name; for OpenAI it is the model id. */
  readonly model: string;
}

let provider: Provider | null | undefined;

/**
 * Azure is configured explicitly rather than via the `AzureOpenAI` helper,
 * which auto-reads `AZURE_OPENAI_ENDPOINT` and then rejects an explicit
 * `endpoint` as a conflict. Building the base URL here keeps it unambiguous.
 */
function createAzureClient(endpoint: string, apiKey: string, deployment: string, apiVersion: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: `${endpoint.replace(/\/+$/, '')}/openai/deployments/${deployment}`,
    defaultQuery: { 'api-version': apiVersion },
    defaultHeaders: { 'api-key': apiKey },
  });
}

function getProvider(): Provider | null {
  if (provider !== undefined) return provider;

  const env = getEnv();
  const { aiProvider } = getCapabilities();

  try {
    if (aiProvider === 'azure') {
      provider = {
        client: createAzureClient(
          env.AZURE_OPENAI_ENDPOINT!,
          env.AZURE_OPENAI_API_KEY!,
          env.AZURE_OPENAI_DEPLOYMENT!,
          env.AZURE_OPENAI_API_VERSION,
        ),
        model: env.AZURE_OPENAI_DEPLOYMENT!,
      };
    } else if (aiProvider === 'openai') {
      provider = { client: new OpenAI({ apiKey: env.OPENAI_API_KEY! }), model: env.OPENAI_MODEL };
    } else {
      provider = null;
    }
  } catch (caught) {
    // A misconfigured provider must degrade to the fallback planner, never 500.
    logger.error('AI provider could not be constructed; using fallback planner', { cause: caught });
    provider = null;
  }

  return provider;
}

export function isAiAvailable(): boolean {
  return getProvider() !== null;
}

/** Test-only: forces the provider to be re-resolved from the environment. */
export function resetProviderCache(): void {
  provider = undefined;
}

/**
 * `json_object` mode guarantees valid JSON but not a particular *shape*, so the
 * schema has to travel in the prompt. Derived from the Zod schema itself, which
 * means the contract can never drift from what validation will accept.
 */
function schemaInstruction<T>(schema: z.ZodType<T>, name: string): string {
  let jsonSchema: unknown;

  try {
    jsonSchema = z.toJSONSchema(schema, { io: 'input' });
  } catch {
    return `Respond with a single JSON object named ${name}.`;
  }

  return [
    `Return a single JSON object conforming to this JSON Schema for "${name}".`,
    'Output only the object itself — do not wrap it, do not add commentary, do not use markdown fences.',
    'Every required property must be present.',
    '',
    JSON.stringify(jsonSchema),
  ].join('\n');
}

export async function callStructured<T>(input: {
  schema: z.ZodType<T>;
  schemaName: string;
  system: string;
  user: string;
  temperature?: number;
  timeoutMs?: number;
}): Promise<StructuredCallResult<T>> {
  const resolved = getProvider();
  if (!resolved) return { ok: false, failure: 'unavailable' };

  const { client, model } = resolved;
  const log = logger.child({ component: 'agent', schema: input.schemaName, model });

  let raw: string | undefined;

  try {
    const response = await client.chat.completions.create(
      {
        model,
        temperature: input.temperature ?? 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: `${input.system}\n\n${schemaInstruction(input.schema, input.schemaName)}` },
          { role: 'user', content: input.user },
        ],
      },
      { timeout: input.timeoutMs ?? 20_000 },
    );

    raw = response.choices[0]?.message?.content ?? undefined;
  } catch (caught) {
    log.warn('agent request failed', { cause: caught });
    return { ok: false, failure: 'request_failed', detail: String(caught) };
  }

  if (!raw) return { ok: false, failure: 'empty_response' };

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { ok: false, failure: 'schema_mismatch', detail: 'Response was not valid JSON.' };
  }

  const validated = input.schema.safeParse(parsedJson);
  if (!validated.success) {
    // Hard rejection: an unvalidated proposal must never influence anything.
    log.warn('agent response failed schema validation', {
      issues: validated.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    });
    return { ok: false, failure: 'schema_mismatch', detail: validated.error.message };
  }

  return { ok: true, data: validated.data, model };
}
