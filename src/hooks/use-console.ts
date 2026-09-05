'use client';

import { useCallback, useEffect, useState } from 'react';

import type {
  ActionResponse,
  ContentResponse,
  CustomerRow,
  DecisionResponse,
  GraphResponse,
  JourneyDetail,
  ScenarioRow,
  TrustResponse,
} from '@/types/api';

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return (await response.json()) as T;
}

export function useConsole() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioRow[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [journeyId, setJourneyId] = useState<string | null>(null);

  const [detail, setDetail] = useState<JourneyDetail | null>(null);
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [trust, setTrust] = useState<TrustResponse | null>(null);
  const [decision, setDecision] = useState<DecisionResponse | null>(null);
  const [executed, setExecuted] = useState<ActionResponse | null>(null);
  const [content, setContent] = useState<ContentResponse | null>(null);
  const [contentLoading, setContentLoading] = useState(false);

  const [action, setAction] = useState('issueVoucher');
  const [cost, setCost] = useState(120);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Firing a scenario often leaves journeyId unchanged, so refresh needs its own trigger.
  const [nonce, setNonce] = useState(0);

  const loadRoster = useCallback(async () => {
    try {
      const [customerData, scenarioData] = await Promise.all([
        getJson<{ customers: CustomerRow[] }>('/api/customers'),
        getJson<{ scenarios: ScenarioRow[] }>('/api/events/simulate'),
      ]);

      setCustomers(customerData.customers);
      setScenarios(scenarioData.scenarios);

      const first = customerData.customers[0];
      if (first) {
        setCustomerId((current) => {
          const stillExists = customerData.customers.some((c) => c.id === current);
          return stillExists ? current : first.id;
        });
        // A reseed invalidates journey ids, so re-resolve rather than stranding the view.
        setJourneyId((current) => {
          const owner = customerData.customers.find((c) => c.activeJourney?.id === current);
          return owner ? current : (first.activeJourney?.id ?? null);
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load roster');
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!journeyId) {
      // Clear stale failures so a reseed does not leave a dead error on screen.
      setError(null);
      setDetail(null);
      setGraph(null);
      setTrust(null);
      return;
    }

    try {
      setError(null);
      const detailData = await getJson<JourneyDetail>(`/api/journeys/${journeyId}`);
      setDetail(detailData);

      if (detailData.events.length === 0) {
        setGraph(null);
        setTrust(null);
        return;
      }

      const [graphData, trustData] = await Promise.all([
        getJson<GraphResponse>(`/api/journeys/${journeyId}/graph`),
        getJson<TrustResponse>(`/api/journeys/${journeyId}/trust?action=${action}&cost=${cost}`),
      ]);

      setGraph(graphData);
      setTrust(trustData);

      // Surface a decision that already exists rather than making the operator re-plan.
      const existing = detailData.decisions?.[0];
      if (existing) {
        const loaded = await getJson<DecisionResponse>(`/api/decisions/${existing.id}`);
        setDecision(loaded);
      } else {
        setDecision(null);
        setContent(null);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load journey');
    }
    // `nonce` is a deliberate re-run trigger, not a value read inside the callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journeyId, action, cost, nonce]);

  useEffect(() => void loadRoster(), [loadRoster]);
  useEffect(() => void refresh(), [refresh]);

  const selectCustomer = useCallback(
    (id: string) => {
      setCustomerId(id);
      setJourneyId(customers.find((customer) => customer.id === id)?.activeJourney?.id ?? null);
      setGraph(null);
      setTrust(null);
      setDetail(null);
      setDecision(null);
      setExecuted(null);
      setContent(null);
    },
    [customers],
  );

  const fireScenario = useCallback(
    async (scenario: string) => {
      if (!customerId) return;
      setBusy(true);
      setError(null);

      try {
        const response = await fetch('/api/events/simulate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ scenario, customerId, journeyId }),
        });

        const body = (await response.json()) as { journeyId?: string; error?: { message: string } };
        if (!response.ok) throw new Error(body.error?.message ?? 'Simulation failed');

        if (body.journeyId) setJourneyId(body.journeyId);
        setDecision(null);
        setExecuted(null);
        setContent(null);
        await loadRoster();
        setNonce((current) => current + 1);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Simulation failed');
      } finally {
        setBusy(false);
      }
    },
    [customerId, journeyId, loadRoster],
  );

  const planDecision = useCallback(async () => {
    if (!journeyId) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/decisions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ journeyId }),
      });

      const body = (await response.json()) as DecisionResponse & { error?: { message: string } };
      if (!response.ok) throw new Error(body.error?.message ?? 'Planning failed');

      setDecision(body);
      setExecuted(null);
      setContent(null);
      setNonce((current) => current + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Planning failed');
    } finally {
      setBusy(false);
    }
  }, [journeyId]);

  const executeOption = useCallback(
    async (optionId: string) => {
      if (!decision) return;
      setBusy(true);
      setError(null);

      try {
        const response = await fetch('/api/actions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ decisionId: decision.decisionId, optionId, approvedBy: 'customer' }),
        });

        const body = (await response.json()) as ActionResponse & { error?: { message: string } };
        if (!response.ok) throw new Error(body.error?.message ?? 'Execution blocked');

        setExecuted(body);
        await loadRoster();
        setNonce((current) => current + 1);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Execution blocked');
      } finally {
        setBusy(false);
      }
    },
    [decision, loadRoster],
  );

  /** Content generation costs an AI call, so it is fetched only when asked for. */
  const loadContent = useCallback(async () => {
    if (!decision || content?.decisionId === decision.decisionId || contentLoading) return;

    setContentLoading(true);
    try {
      const response = await fetch(`/api/decisions/${decision.decisionId}/content`, { cache: 'no-store' });
      setContent(response.ok ? ((await response.json()) as ContentResponse) : null);
    } catch {
      setContent(null);
    } finally {
      setContentLoading(false);
    }
  }, [decision, content, contentLoading]);

  const resetDemo = useCallback(async () => {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/demo/reset', { method: 'POST' });
      if (!response.ok) throw new Error('Reset failed');

      setJourneyId(null);
      setCustomerId(null);
      setDetail(null);
      setGraph(null);
      setTrust(null);
      setDecision(null);
      setExecuted(null);
      setContent(null);
      await loadRoster();
      setNonce((current) => current + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Reset failed');
    } finally {
      setBusy(false);
    }
  }, [loadRoster]);

  return {
    customers,
    scenarios,
    customerId,
    journeyId,
    detail,
    graph,
    trust,
    decision,
    executed,
    content,
    contentLoading,
    loadContent,
    action,
    cost,
    busy,
    error,
    setAction,
    setCost,
    selectCustomer,
    fireScenario,
    planDecision,
    executeOption,
    resetDemo,
    refresh,
  };
}
