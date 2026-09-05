import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';

import * as schema from './schema';

export type Database = LibSQLDatabase<typeof schema>;

export interface DatabaseConnection {
  readonly db: Database;
  readonly client: Client;
  close(): void;
}

/** libSQL will not create intermediate directories for a `file:` URL. */
function ensureDirectoryFor(url: string): void {
  if (!url.startsWith('file:')) return;

  const filePath = url.slice('file:'.length);
  if (filePath === ':memory:' || filePath === '') return;

  mkdirSync(dirname(resolve(filePath)), { recursive: true });
}

export function createDatabase(url: string, authToken?: string): DatabaseConnection {
  ensureDirectoryFor(url);

  const client = createClient(authToken ? { url, authToken } : { url });
  const db = drizzle(client, { schema });

  return { db, client, close: () => client.close() };
}

/** Isolated in-memory database for tests. */
export function createInMemoryDatabase(): DatabaseConnection {
  return createDatabase(':memory:');
}
