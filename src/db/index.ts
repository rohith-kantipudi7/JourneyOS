/**
 * Persistence layer (Drizzle + SQLite/libSQL).
 *
 *   schema/       Drizzle table definitions
 *   migrations/   Generated SQL migrations (do not hand-edit)
 *   repositories/ The only sanctioned way to read/write domain data
 *   seed/         Demo data: customer, BLR→PAR journey, consent, history
 *
 * Route handlers, services, and components must go through a repository —
 * never call Drizzle directly.
 */
import { getEnv } from '@/lib/env';

import { createDatabase, type DatabaseConnection } from './client';

export * from './client';
export * from './repositories';
export * as schema from './schema';

let connection: DatabaseConnection | undefined;

/** Process-wide connection for the running app. Tests build their own instead. */
export function getDatabaseConnection(): DatabaseConnection {
  if (!connection) {
    const env = getEnv();
    connection = createDatabase(env.DATABASE_URL, env.DATABASE_AUTH_TOKEN);
  }
  return connection;
}
