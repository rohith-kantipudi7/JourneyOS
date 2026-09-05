import { and, desc, eq, ne } from 'drizzle-orm';

import type { Clock, CustomerId, JourneyId } from '@/core/shared';
import { systemClock } from '@/core/shared';
import type { Customer, CustomerRepository, Journey, JourneyRepository, JourneyStatus, NewCustomer, NewJourney } from '@/types';

import type { Database } from '../client';
import { customers, journeys } from '../schema';
import { RecordNotFoundError } from './errors';
import { toCustomer, toJourney } from './mappers';

export class SqliteCustomerRepository implements CustomerRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock = systemClock,
  ) {}

  async findById(id: CustomerId): Promise<Customer | undefined> {
    const [row] = await this.db.select().from(customers).where(eq(customers.id, id)).limit(1);
    return row ? toCustomer(row) : undefined;
  }

  async findByEmail(email: string): Promise<Customer | undefined> {
    const [row] = await this.db.select().from(customers).where(eq(customers.email, email)).limit(1);
    return row ? toCustomer(row) : undefined;
  }

  async list(): Promise<Customer[]> {
    const rows = await this.db.select().from(customers).orderBy(customers.name);
    return rows.map(toCustomer);
  }

  async create(customer: NewCustomer): Promise<Customer> {
    const now = this.clock.now();
    const [row] = await this.db
      .insert(customers)
      .values({ ...customer, preferences: customer.preferences, createdAt: now, updatedAt: now })
      .returning();

    if (!row) throw new Error('Failed to insert customer');
    return toCustomer(row);
  }

  async updatePreferences(id: CustomerId, preferences: Customer['preferences']): Promise<Customer> {
    const [row] = await this.db
      .update(customers)
      .set({ preferences, updatedAt: this.clock.now() })
      .where(eq(customers.id, id))
      .returning();

    if (!row) throw new RecordNotFoundError('Customer', id);
    return toCustomer(row);
  }
}

export class SqliteJourneyRepository implements JourneyRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock = systemClock,
  ) {}

  async findById(id: JourneyId): Promise<Journey | undefined> {
    const [row] = await this.db.select().from(journeys).where(eq(journeys.id, id)).limit(1);
    return row ? toJourney(row) : undefined;
  }

  async listByCustomer(customerId: CustomerId): Promise<Journey[]> {
    const rows = await this.db
      .select()
      .from(journeys)
      .where(eq(journeys.customerId, customerId))
      .orderBy(desc(journeys.startedAt));
    return rows.map(toJourney);
  }

  async listHistory(customerId: CustomerId, excludeJourneyId: JourneyId, limit = 10): Promise<Journey[]> {
    const rows = await this.db
      .select()
      .from(journeys)
      .where(and(eq(journeys.customerId, customerId), ne(journeys.id, excludeJourneyId)))
      .orderBy(desc(journeys.startedAt))
      .limit(limit);
    return rows.map(toJourney);
  }

  async create(journey: NewJourney): Promise<Journey> {
    const now = this.clock.now();
    const [row] = await this.db
      .insert(journeys)
      .values({ ...journey, createdAt: now, updatedAt: now })
      .returning();

    if (!row) throw new Error('Failed to insert journey');
    return toJourney(row);
  }

  async updateStatus(id: JourneyId, status: JourneyStatus): Promise<Journey> {
    const now = this.clock.now();
    const [row] = await this.db
      .update(journeys)
      .set({
        status,
        updatedAt: now,
        ...(status === 'completed' || status === 'cancelled' ? { completedAt: now } : {}),
      })
      .where(eq(journeys.id, id))
      .returning();

    if (!row) throw new RecordNotFoundError('Journey', id);
    return toJourney(row);
  }

  async updateContext(id: JourneyId, context: Journey['context']): Promise<Journey> {
    const [row] = await this.db
      .update(journeys)
      .set({ context, updatedAt: this.clock.now() })
      .where(eq(journeys.id, id))
      .returning();

    if (!row) throw new RecordNotFoundError('Journey', id);
    return toJourney(row);
  }
}
