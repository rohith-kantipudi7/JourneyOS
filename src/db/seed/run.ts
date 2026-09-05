import { createDatabase } from '../client';
import { runMigrations } from '../migrate';
import { runSeedPipeline } from './pipeline';
import { seedDatabase } from './seed';

/** CLI entry for `npm run db:seed` — migrates, then wipes and repopulates demo data. */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? 'file:./data/journeyos.db';
  const connection = createDatabase(url, process.env.DATABASE_AUTH_TOKEN);

  try {
    await runMigrations(connection.db);
    const dataset = await seedDatabase(connection.db);
    const pipeline = await runSeedPipeline(connection.db);

    console.log('JourneyOS seed complete');
    console.log(`  database      ${url}`);
    console.log(`  customers     ${dataset.customers.length}`);
    console.log(`  journeys      ${dataset.journeys.length}`);
    console.log(`  consents      ${dataset.consents.length}`);
    console.log(`  events        ${dataset.events.length}`);
    console.log(`  decisions     ${pipeline.decisions} of ${pipeline.considered} disrupted`);
    console.log(`  executed      ${pipeline.executed}`);
    console.log(`  policy-blocked ${pipeline.blocked}`);
    console.log(`  demo journey  ${dataset.primaryJourneyId}`);
  } finally {
    connection.close();
  }
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exitCode = 1;
});
