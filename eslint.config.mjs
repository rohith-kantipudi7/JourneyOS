import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'out/**',
      'dist/**',
      'coverage/**',
      'next-env.d.ts',
      'src/db/migrations/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...compat.extends('next/core-web-vitals'),

  // `next/core-web-vitals` swaps in its own parser; restore the typescript-eslint
  // parser with project info so type-aware rules can run.
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
  },

  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },

  // Architectural boundary: UI components hold no business logic and never touch persistence or adapters.
  {
    files: ['src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/db/*', '@/db'], message: 'UI components must not access persistence. Fetch via a route handler or server component.' },
            { group: ['@/adapters/*'], message: 'UI components must not call adapters directly. Go through a service.' },
            { group: ['@/agents/*'], message: 'UI components must not invoke agents directly. Go through a service or API route.' },
          ],
        },
      ],
    },
  },

  // Architectural boundary: the Trust Kernel is 100% deterministic — no AI, no I/O adapters.
  {
    files: ['src/core/trust/**/*.ts', 'src/policies/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'openai', message: 'The Trust Kernel must remain deterministic. No LLM calls allowed.' }],
          patterns: [
            { group: ['@/agents/*'], message: 'The Trust Kernel must remain deterministic. No agent calls allowed.' },
            { group: ['@/adapters/*'], message: 'The Trust Kernel evaluates inputs only; it must not perform I/O.' },
          ],
        },
      ],
    },
  },

  // Agents propose; they never execute. Keep adapters and persistence out of them.
  {
    files: ['src/agents/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/adapters/travel*', '@/adapters/crm*', '@/adapters/notification*', '@/adapters/escalation*'], message: 'AI proposes, it never executes. Execution belongs to the Action Runtime.' },
            { group: ['@/db/repositories/*'], message: 'Agents receive context as input; they must not query persistence directly.' },
          ],
        },
      ],
    },
  },

  {
    files: ['**/*.config.{ts,mts,mjs,js}', 'src/db/seed/**/*.ts', 'src/tests/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  prettier,
);
