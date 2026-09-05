import { and, desc, eq } from 'drizzle-orm';

import type { ActionId, AuditRecordId, Clock, CorrelationId, DecisionId, IdempotencyKey, JourneyId } from '@/core/shared';
import { AuditRecordIds, systemClock } from '@/core/shared';
import type {
  Action,
  ActionRepository,
  ActionStatus,
  AuditRecord,
  AuditRepository,
  AuditStage,
  NewAction,
  NewAuditRecord,
} from '@/types';

import type { Database } from '../client';
import { actions, auditRecords } from '../schema';
import { RecordNotFoundError } from './errors';
import { toAction, toAuditRecord } from './mappers';

export class SqliteActionRepository implements ActionRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock = systemClock,
  ) {}

  async findById(id: ActionId): Promise<Action | undefined> {
    const [row] = await this.db.select().from(actions).where(eq(actions.id, id)).limit(1);
    return row ? toAction(row) : undefined;
  }

  async findByIdempotencyKey(key: IdempotencyKey): Promise<Action | undefined> {
    const [row] = await this.db.select().from(actions).where(eq(actions.idempotencyKey, key)).limit(1);
    return row ? toAction(row) : undefined;
  }

  async listByJourney(journeyId: JourneyId): Promise<Action[]> {
    const rows = await this.db
      .select()
      .from(actions)
      .where(eq(actions.journeyId, journeyId))
      .orderBy(desc(actions.createdAt));
    return rows.map(toAction);
  }

  async listByDecision(decisionId: DecisionId): Promise<Action[]> {
    const rows = await this.db
      .select()
      .from(actions)
      .where(eq(actions.decisionId, decisionId))
      .orderBy(desc(actions.createdAt));
    return rows.map(toAction);
  }

  async create(action: NewAction): Promise<Action> {
    const now = this.clock.now();
    const [row] = await this.db
      .insert(actions)
      .values({ ...action, createdAt: now, updatedAt: now })
      .returning();

    if (!row) throw new Error('Failed to insert action');
    return toAction(row);
  }

  async markApproved(id: ActionId, approvedBy: Action['approvedBy'], approvedAt: Date): Promise<Action> {
    const [row] = await this.db
      .update(actions)
      .set({ status: 'approved', approvedBy, approvedAt, updatedAt: this.clock.now() })
      .where(eq(actions.id, id))
      .returning();

    if (!row) throw new RecordNotFoundError('Action', id);
    return toAction(row);
  }

  async markStatus(id: ActionId, status: ActionStatus): Promise<Action> {
    const [row] = await this.db
      .update(actions)
      .set({ status, updatedAt: this.clock.now() })
      .where(eq(actions.id, id))
      .returning();

    if (!row) throw new RecordNotFoundError('Action', id);
    return toAction(row);
  }

  async markExecuted(id: ActionId, result: Action['result'], executedAt: Date): Promise<Action> {
    const [row] = await this.db
      .update(actions)
      .set({ status: 'succeeded', result, executedAt, updatedAt: this.clock.now() })
      .where(eq(actions.id, id))
      .returning();

    if (!row) throw new RecordNotFoundError('Action', id);
    return toAction(row);
  }

  async markFailed(id: ActionId, failureReason: string): Promise<Action> {
    const [row] = await this.db
      .update(actions)
      .set({ status: 'failed', failureReason, updatedAt: this.clock.now() })
      .where(eq(actions.id, id))
      .returning();

    if (!row) throw new RecordNotFoundError('Action', id);
    return toAction(row);
  }
}

export class SqliteAuditRepository implements AuditRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock = systemClock,
  ) {}

  async append(record: NewAuditRecord): Promise<AuditRecord> {
    const [row] = await this.db
      .insert(auditRecords)
      .values({
        ...record,
        id: record.id satisfies AuditRecordId,
        occurredAt: record.occurredAt ?? this.clock.now(),
      })
      .returning();

    if (!row) throw new Error('Failed to append audit record');
    return toAuditRecord(row);
  }

  async listByJourney(journeyId: JourneyId): Promise<AuditRecord[]> {
    const rows = await this.db
      .select()
      .from(auditRecords)
      .where(eq(auditRecords.journeyId, journeyId))
      .orderBy(auditRecords.occurredAt);
    return rows.map(toAuditRecord);
  }

  async listByCorrelationId(correlationId: CorrelationId): Promise<AuditRecord[]> {
    const rows = await this.db
      .select()
      .from(auditRecords)
      .where(eq(auditRecords.correlationId, correlationId))
      .orderBy(auditRecords.occurredAt);
    return rows.map(toAuditRecord);
  }

  async listByStage(journeyId: JourneyId, stage: AuditStage): Promise<AuditRecord[]> {
    const rows = await this.db
      .select()
      .from(auditRecords)
      .where(and(eq(auditRecords.journeyId, journeyId), eq(auditRecords.stage, stage)))
      .orderBy(auditRecords.occurredAt);
    return rows.map(toAuditRecord);
  }

  /** Convenience for callers that do not want to mint an id themselves. */
  nextId(): AuditRecordId {
    return AuditRecordIds.generate();
  }
}
