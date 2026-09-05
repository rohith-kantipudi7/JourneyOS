import { relations } from 'drizzle-orm';

import { actions, auditRecords, consents, contextSnapshots, customers, decisions, events, journeys } from './tables';

export const customersRelations = relations(customers, ({ many }) => ({
  journeys: many(journeys),
  events: many(events),
  consents: many(consents),
}));

export const journeysRelations = relations(journeys, ({ one, many }) => ({
  customer: one(customers, { fields: [journeys.customerId], references: [customers.id] }),
  events: many(events),
  decisions: many(decisions),
  actions: many(actions),
  auditRecords: many(auditRecords),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  customer: one(customers, { fields: [events.customerId], references: [customers.id] }),
  journey: one(journeys, { fields: [events.journeyId], references: [journeys.id] }),
  decisions: many(decisions),
}));

export const consentsRelations = relations(consents, ({ one }) => ({
  customer: one(customers, { fields: [consents.customerId], references: [customers.id] }),
}));

export const contextSnapshotsRelations = relations(contextSnapshots, ({ one, many }) => ({
  journey: one(journeys, { fields: [contextSnapshots.journeyId], references: [journeys.id] }),
  event: one(events, { fields: [contextSnapshots.eventId], references: [events.id] }),
  decisions: many(decisions),
}));

export const decisionsRelations = relations(decisions, ({ one, many }) => ({
  journey: one(journeys, { fields: [decisions.journeyId], references: [journeys.id] }),
  event: one(events, { fields: [decisions.eventId], references: [events.id] }),
  snapshot: one(contextSnapshots, { fields: [decisions.snapshotId], references: [contextSnapshots.id] }),
  actions: many(actions),
}));

export const actionsRelations = relations(actions, ({ one }) => ({
  decision: one(decisions, { fields: [actions.decisionId], references: [decisions.id] }),
  journey: one(journeys, { fields: [actions.journeyId], references: [journeys.id] }),
}));

export const auditRecordsRelations = relations(auditRecords, ({ one }) => ({
  journey: one(journeys, { fields: [auditRecords.journeyId], references: [journeys.id] }),
}));
