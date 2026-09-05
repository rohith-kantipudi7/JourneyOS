import type { Database } from '../client';
import { actions, auditRecords, consents, contextSnapshots, customers, decisions, events, journeys } from '../schema';
import { buildSeedDataset, type SeedDataset } from './dataset';

/** Child-first order so foreign keys are never violated. */
export async function clearAllTables(db: Database): Promise<void> {
  await db.delete(auditRecords);
  await db.delete(actions);
  await db.delete(decisions);
  await db.delete(contextSnapshots);
  await db.delete(events);
  await db.delete(consents);
  await db.delete(journeys);
  await db.delete(customers);
}

/** Wipes and repopulates the demo dataset. Safe to re-run between demo takes. */
export async function seedDatabase(db: Database, now: Date = new Date()): Promise<SeedDataset> {
  const dataset = buildSeedDataset(now);

  await clearAllTables(db);

  await db.insert(customers).values(dataset.customers.map((customer) => ({ ...customer })));
  await db.insert(journeys).values(dataset.journeys.map((journey) => ({ ...journey })));
  await db.insert(consents).values(dataset.consents.map((consent) => ({ ...consent })));
  await db.insert(events).values(dataset.events.map((event) => ({ ...event })));

  if (dataset.auditRecords.length > 0) {
    await db.insert(auditRecords).values(dataset.auditRecords.map((record) => ({ ...record })));
  }

  return dataset;
}
