import type { TrustContext } from '@/types';

/**
 * Declarative policy expressions.
 *
 * Real enterprise policy is conditional and layered — "(tier is Gold OR prior
 * incidents < 2) AND spend is within cap" — not one flat boolean. Expressing
 * that as a tree means the evaluation can be *explained*: the trace shows which
 * branch decided the outcome, not just the final answer.
 */
export type PolicyExpression =
  | { readonly kind: 'predicate'; readonly id: string }
  | { readonly kind: 'and'; readonly of: readonly PolicyExpression[] }
  | { readonly kind: 'or'; readonly of: readonly PolicyExpression[] }
  | { readonly kind: 'not'; readonly of: PolicyExpression };

export const predicate = (id: string): PolicyExpression => ({ kind: 'predicate', id });
export const and = (...of: PolicyExpression[]): PolicyExpression => ({ kind: 'and', of });
export const or = (...of: PolicyExpression[]): PolicyExpression => ({ kind: 'or', of });
export const not = (of: PolicyExpression): PolicyExpression => ({ kind: 'not', of });

export interface PolicyPredicate {
  readonly id: string;
  readonly label: string;
  evaluate(context: TrustContext): boolean;
  /** Human-readable justification, rendered verbatim in the Decision Inspector. */
  explain(context: TrustContext, satisfied: boolean): string;
}

export type PredicateRegistry = Readonly<Record<string, PolicyPredicate>>;

export interface ExpressionTrace {
  readonly expression: string;
  readonly satisfied: boolean;
  /** Only the branches that actually determined the result. */
  readonly decidedBy: readonly string[];
}

class UnknownPredicateError extends Error {
  constructor(id: string) {
    super(`Policy references an unregistered predicate: "${id}"`);
    this.name = 'UnknownPredicateError';
  }
}

function resolve(registry: PredicateRegistry, id: string): PolicyPredicate {
  const found = registry[id];
  if (!found) throw new UnknownPredicateError(id);
  return found;
}

/** Renders an expression as readable text, e.g. `(A OR NOT B) AND C`. */
export function describeExpression(expression: PolicyExpression, registry: PredicateRegistry): string {
  switch (expression.kind) {
    case 'predicate':
      return resolve(registry, expression.id).label;
    case 'not':
      return `NOT ${describeExpression(expression.of, registry)}`;
    case 'and':
      return `(${expression.of.map((e) => describeExpression(e, registry)).join(' AND ')})`;
    case 'or':
      return `(${expression.of.map((e) => describeExpression(e, registry)).join(' OR ')})`;
  }
}

/**
 * Evaluates an expression and reports which sub-expressions drove the result:
 * for a failed AND, the branches that failed; for a failed OR, all of them.
 */
export function evaluateExpression(
  expression: PolicyExpression,
  registry: PredicateRegistry,
  context: TrustContext,
): ExpressionTrace {
  const describe = (): string => describeExpression(expression, registry);

  switch (expression.kind) {
    case 'predicate': {
      const resolved = resolve(registry, expression.id);
      const satisfied = resolved.evaluate(context);
      return {
        expression: resolved.label,
        satisfied,
        decidedBy: [resolved.explain(context, satisfied)],
      };
    }

    case 'not': {
      const inner = evaluateExpression(expression.of, registry, context);
      return { expression: describe(), satisfied: !inner.satisfied, decidedBy: inner.decidedBy };
    }

    case 'and': {
      const traces = expression.of.map((child) => evaluateExpression(child, registry, context));
      const failures = traces.filter((trace) => !trace.satisfied);
      return {
        expression: describe(),
        satisfied: failures.length === 0,
        decidedBy: (failures.length > 0 ? failures : traces).flatMap((trace) => trace.decidedBy),
      };
    }

    case 'or': {
      const traces = expression.of.map((child) => evaluateExpression(child, registry, context));
      const successes = traces.filter((trace) => trace.satisfied);
      return {
        expression: describe(),
        satisfied: successes.length > 0,
        decidedBy: (successes.length > 0 ? successes : traces).flatMap((trace) => trace.decidedBy),
      };
    }
  }
}
