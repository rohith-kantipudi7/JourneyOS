import { beforeEach } from 'vitest';

import { resetEnvCache } from '@/lib/env';

// Tests must never reach the network: force every agent onto its fallback path.
process.env.OPENAI_API_KEY = '';
process.env.AZURE_OPENAI_ENDPOINT = '';
process.env.AZURE_OPENAI_API_KEY = '';
process.env.AZURE_OPENAI_DEPLOYMENT = '';

beforeEach(() => {
  resetEnvCache();
});
