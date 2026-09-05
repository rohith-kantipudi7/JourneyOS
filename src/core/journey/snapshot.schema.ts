import { z } from 'zod';

import { CustomerIds, EventIds, JourneyIds, SnapshotIds } from '@/core/shared';
import { CONTEXT_EDGE_TYPES, CONTEXT_NODE_TYPES } from '@/types';

const jsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValue), z.record(z.string(), jsonValue)]),
);

export const provenanceSchema = z.object({
  sourceSystem: z.string().min(1),
  retrievedAt: z.date(),
  stale: z.boolean(),
  ageSeconds: z.number().int().nonnegative(),
});

export const contextNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(CONTEXT_NODE_TYPES),
  label: z.string().min(1),
  data: z.record(z.string(), jsonValue),
  provenance: provenanceSchema,
});

export const contextEdgeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(CONTEXT_EDGE_TYPES),
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().min(1),
});

export const contextSnapshotSchema = z
  .object({
    id: SnapshotIds.schema,
    journeyId: JourneyIds.schema,
    customerId: CustomerIds.schema,
    eventId: EventIds.schema,
    nodes: z.array(contextNodeSchema).min(1),
    edges: z.array(contextEdgeSchema),
    stale: z.boolean(),
    builtAt: z.date(),
  })
  .superRefine((snapshot, ctx) => {
    const ids = new Set(snapshot.nodes.map((node) => node.id));

    if (ids.size !== snapshot.nodes.length) {
      ctx.addIssue({ code: 'custom', path: ['nodes'], message: 'Node ids must be unique.' });
    }

    // A dangling edge would render as a broken graph and silently hide context.
    for (const [index, edge] of snapshot.edges.entries()) {
      if (!ids.has(edge.from)) {
        ctx.addIssue({
          code: 'custom',
          path: ['edges', index, 'from'],
          message: `Edge references unknown node "${edge.from}".`,
        });
      }
      if (!ids.has(edge.to)) {
        ctx.addIssue({
          code: 'custom',
          path: ['edges', index, 'to'],
          message: `Edge references unknown node "${edge.to}".`,
        });
      }
    }

    const staleNodes = snapshot.nodes.some((node) => node.provenance.stale);
    if (staleNodes !== snapshot.stale) {
      ctx.addIssue({
        code: 'custom',
        path: ['stale'],
        message: 'Snapshot staleness must reflect whether any contributing node is stale.',
      });
    }
  });

export type ValidatedContextSnapshot = z.infer<typeof contextSnapshotSchema>;
