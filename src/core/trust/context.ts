import type { ContextSnapshot, GrantedConsent, PriorIncidentSummary, ProposedAction, StaleInput, TrustContext } from '@/types';

const EMPTY_SUMMARY: PriorIncidentSummary = {
  totalPriorJourneys: 0,
  disruptedJourneys: 0,
  disruptionsLast90Days: 0,
  disruptionEventsLast90Days: 0,
  compensationEventsLast90Days: 0,
  compensationTotalEurLast90Days: 0,
  compensationWithin30Days: false,
  daysSinceLastIncident: null,
  repeatDisruptionRate: 0,
};

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Projects a Context Snapshot onto the flat, serializable input the Trust
 * Kernel evaluates.
 *
 * Keeping this projection explicit means the kernel never walks the graph
 * itself, so its inputs can be captured verbatim in an audit record and
 * replayed later.
 */
export function buildTrustContext(snapshot: ContextSnapshot, action: ProposedAction): TrustContext {
  const customer = snapshot.nodes.find((node) => node.type === 'Customer');
  const summaryNode = snapshot.nodes.find((node) => node.type === 'PriorIncidentSummary');

  const grantedConsents: GrantedConsent[] = snapshot.nodes
    .filter((node) => node.type === 'Consent' && node.data.granted === true)
    .map((node) => ({
      channel: node.data.channel as GrantedConsent['channel'],
      purpose: node.data.purpose as GrantedConsent['purpose'],
    }));

  const staleInputs: StaleInput[] = snapshot.nodes
    .filter((node) => node.provenance.stale)
    .map((node) => ({
      nodeId: node.id,
      nodeType: node.type,
      sourceSystem: node.provenance.sourceSystem,
      ageSeconds: node.provenance.ageSeconds,
    }));

  const summary = summaryNode
    ? ({ ...EMPTY_SUMMARY, ...summaryNode.data } as unknown as PriorIncidentSummary)
    : EMPTY_SUMMARY;

  return {
    customerId: snapshot.customerId,
    loyaltyTier: readString(customer?.data.loyaltyTier, 'standard') as TrustContext['loyaltyTier'],
    loyaltyPoints: readNumber(customer?.data.loyaltyPoints, 0),
    action,
    grantedConsents,
    priorIncidents: summary,
    contextRisk: readNumber(summaryNode?.data.riskContribution, 0),
    staleInputs,
    evaluatedAt: snapshot.builtAt,
  };
}
