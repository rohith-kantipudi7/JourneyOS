import { createInMemoryDatabase, type DatabaseConnection } from '@/db/client';
import { runMigrations } from '@/db/migrate';

/** Fresh, isolated, migrated in-memory database for a single test file. */
export async function createTestDatabase(): Promise<DatabaseConnection> {
  const connection = createInMemoryDatabase();
  await runMigrations(connection.db);
  return connection;
}
