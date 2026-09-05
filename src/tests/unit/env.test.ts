import { describe, expect, it } from 'vitest';

import { EnvValidationError, parseEnv, resolveCapabilities } from '@/lib/env';

describe('environment validation', () => {
  it('applies safe defaults when nothing is configured', () => {
    const env = parseEnv({});

    expect(env.NODE_ENV).toBe('development');
    expect(env.APP_URL).toBe('http://localhost:3000');
    expect(env.DATABASE_URL).toBe('file:./data/journeyos.db');
    expect(env.OPENAI_MODEL).toBe('gpt-4o-mini');
  });

  it('treats blank values as absent so fallbacks activate', () => {
    const env = parseEnv({ OPENAI_API_KEY: '   ', CONTENTSTACK_API_KEY: '' });

    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.CONTENTSTACK_API_KEY).toBeUndefined();
  });

  it('rejects a malformed URL with a field-level message', () => {
    expect(() => parseEnv({ APP_URL: 'not-a-url' })).toThrow(EnvValidationError);

    try {
      parseEnv({ APP_URL: 'not-a-url' });
    } catch (error) {
      expect((error as EnvValidationError).issues.join()).toContain('APP_URL');
    }
  });

  it('reports every integration as unavailable with zero credentials', () => {
    expect(resolveCapabilities(parseEnv({}))).toEqual({
      ai: false,
      aiProvider: null,
      contentstack: false,
      amadeus: false,
    });
  });

  it('detects an Azure OpenAI deployment only when all three parts are present', () => {
    const partial = resolveCapabilities(parseEnv({ AZURE_OPENAI_ENDPOINT: 'https://x.openai.azure.com' }));
    expect(partial.ai).toBe(false);

    const complete = resolveCapabilities(
      parseEnv({
        AZURE_OPENAI_ENDPOINT: 'https://x.openai.azure.com',
        AZURE_OPENAI_API_KEY: 'key',
        AZURE_OPENAI_DEPLOYMENT: 'gpt-4o',
      }),
    );
    expect(complete.ai).toBe(true);
    expect(complete.aiProvider).toBe('azure');
  });

  it('prefers Azure over direct OpenAI when both are configured', () => {
    const capabilities = resolveCapabilities(
      parseEnv({
        OPENAI_API_KEY: 'sk-test',
        AZURE_OPENAI_ENDPOINT: 'https://x.openai.azure.com',
        AZURE_OPENAI_API_KEY: 'key',
        AZURE_OPENAI_DEPLOYMENT: 'gpt-4o',
      }),
    );

    expect(capabilities.aiProvider).toBe('azure');
  });

  it('falls back to direct OpenAI when Azure is absent', () => {
    expect(resolveCapabilities(parseEnv({ OPENAI_API_KEY: 'sk-test' })).aiProvider).toBe('openai');
  });

  it('requires both halves of a credential pair before marking it live', () => {
    const partial = resolveCapabilities(parseEnv({ AMADEUS_API_KEY: 'key' }));
    expect(partial.amadeus).toBe(false);

    const complete = resolveCapabilities(parseEnv({ AMADEUS_API_KEY: 'key', AMADEUS_API_SECRET: 'secret' }));
    expect(complete.amadeus).toBe(true);
  });
});
