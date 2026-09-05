import { resolve } from 'node:path';

import { migrate } from 'drizzle-orm/libsql/migrator';

import type { Database } from './client';

export const MIGRATIONS_FOLDER = resolve(process.cwd(), 'src/db/migrations');

export async function runMigrations(db: Database, migrationsFolder = MIGRATIONS_FOLDER): Promise<void> {
  await migrate(db, { migrationsFolder });
}
