import { desc, eq } from 'drizzle-orm';

import type { Clock, DecisionId, EventId, JourneyId, SnapshotId } from '@/core/shared';
import { systemClock } from '@/core/shared';
import type {
  ContextSnapshot,
  Decision,
  DecisionRepository,
  DecisionStatus,
  NewContextSnapshot,
  NewDecision,
  SnapshotRepository,
} from '@/types';

import type { Database } from '../client';
import { contextSnapshots, decisions } from '../schema';
import { RecordNotFoundError } from './errors';
import { confidenceToBasisPoints, toContextSnapshot, toDecision } from './mappers';

export class SqliteSnapshotRepository implements SnapshotRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock = systemClock,
  ) {}

  async findById(id: SnapshotId): Promise<ContextSnapshot | undefined> {
    const [row] = await this.db.select().from(contextSnapshots).where(eq(contextSnapshots.id, id)).limit(1);
    return row ? toContextSnapshot(row) : undefined;
  }

  async listByJourney(journeyId: JourneyId): Promise<ContextSnapshot[]> {
    const rows = await this.db
      .select()
      .from(contextSnapshots)
      .where(eq(contextSnapshots.journeyId, journeyId))
      .orderBy(desc(contextSnapshots.builtAt));
    return rows.map(toContextSnapshot);
  }

  async create(snapshot: NewContextSnapshot): Promise<ContextSnapshot> {
    const [row] = await this.db
      .insert(contextSnapshots)
      .values({
        id: snapshot.id,
        journeyId: snapshot.journeyId,
        customerId: snapshot.customerId,
        eventId: snapshot.eventId,
        nodes: [...snapshot.nodes],
        edges: [...snapshot.edges],
        stale: snapshot.stale,
        builtAt: snapshot.builtAt ?? this.clock.now(),
      })
      .returning();

    if (!row) throw new Error('Failed to insert context snapshot');
    return toContextSnapshot(row);
  }
}

export class SqliteDecisionRepository implements DecisionRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock = systemClock,
  ) {}

  async findById(id: DecisionId): Promise<Decision | undefined> {
    const [row] = await this.db.select().from(decisions).where(eq(decisions.id, id)).limit(1);
    return row ? toDecision(row) : undefined;
  }

  async listByJourney(journeyId: JourneyId): Promise<Decision[]> {
    const rows = await this.db
      .select()
      .from(decisions)
      .where(eq(decisions.journeyId, journeyId))
      .orderBy(desc(decisions.createdAt));
    return rows.map(toDecision);
  }

  async findLatestForEvent(eventId: EventId): Promise<Decision | undefined> {
    const [row] = await this.db
      .select()
      .from(decisions)
      .where(eq(decisions.eventId, eventId))
      .orderBy(desc(decisions.createdAt))
      .limit(1);
    return row ? toDecision(row) : undefined;
  }

  async create(decision: NewDecision): Promise<Decision> {
    const [row] = await this.db
      .insert(decisions)
      .values({
        id: decision.id,
        journeyId: decision.journeyId,
        eventId: decision.eventId,
        snapshotId: decision.snapshotId,
        status: decision.status,
        planner: decision.planner,
        model: decision.model,
        promptVersion: decision.promptVersion,
        weights: decision.weights,
        bestOption: decision.bestOption,
        alternatives: [...decision.alternatives],
        confidence: confidenceToBasisPoints(decision.confidence),
        reasoning: decision.reasoning,
        evidence: [...decision.evidence],
        trustOutcome: decision.trust.outcome,
        trustRiskScore: decision.trust.riskScore,
        trustChecks: [...decision.trust.checks],
        trustRiskFactors: [...decision.trust.riskFactors],
        trustPolicyVersion: decision.trust.policyVersion,
        trustEvaluatedAt: decision.trust.evaluatedAt,
        createdAt: this.clock.now(),
        decidedAt: decision.decidedAt ?? null,
      })
      .returning();

    if (!row) throw new Error('Failed to insert decision');
    return toDecision(row);
  }

  async updateStatus(id: DecisionId, status: DecisionStatus, decidedAt: Date): Promise<Decision> {
    const [row] = await this.db
      .update(decisions)
      .set({ status, decidedAt })
      .where(eq(decisions.id, id))
      .returning();

    if (!row) throw new RecordNotFoundError('Decision', id);
    return toDecision(row);
  }
}
