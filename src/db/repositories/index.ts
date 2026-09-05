import type { Clock } from '@/core/shared';
import { systemClock } from '@/core/shared';
import type { Repositories } from '@/types';

import type { Database } from '../client';
import { SqliteActionRepository, SqliteAuditRepository } from './action-audit.repository';
import { SqliteCustomerRepository, SqliteJourneyRepository } from './customer-journey.repository';
import { SqliteDecisionRepository, SqliteSnapshotRepository } from './decision.repository';
import { SqliteConsentRepository, SqliteEventRepository } from './event-consent.repository';

export * from './errors';
export * from './mappers';
export {
  SqliteActionRepository,
  SqliteAuditRepository,
  SqliteConsentRepository,
  SqliteCustomerRepository,
  SqliteDecisionRepository,
  SqliteEventRepository,
  SqliteJourneyRepository,
  SqliteSnapshotRepository,
};

/** Builds the full persistence surface for injection into services. */
export function createRepositories(db: Database, clock: Clock = systemClock): Repositories {
  return {
    customers: new SqliteCustomerRepository(db, clock),
    journeys: new SqliteJourneyRepository(db, clock),
    events: new SqliteEventRepository(db, clock),
    consents: new SqliteConsentRepository(db, clock),
    snapshots: new SqliteSnapshotRepository(db, clock),
    decisions: new SqliteDecisionRepository(db, clock),
    actions: new SqliteActionRepository(db, clock),
    audit: new SqliteAuditRepository(db, clock),
  };
}
