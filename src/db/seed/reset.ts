import { createDatabase } from '../client';
import { runMigrations } from '../migrate';
import { clearAllTables } from './seed';

/** CLI entry for `npm run db:reset` — empties every table without reseeding. */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? 'file:./data/journeyos.db';
  const connection = createDatabase(url, process.env.DATABASE_AUTH_TOKEN);

  try {
    await runMigrations(connection.db);
    await clearAllTables(connection.db);
    console.log(`JourneyOS database cleared: ${url}`);
  } finally {
    connection.close();
  }
}

main().catch((error: unknown) => {
  console.error('Reset failed:', error);
  process.exitCode = 1;
});
