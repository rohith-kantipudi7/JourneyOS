import type { SimulatorScenario } from '@/events';

/**
 * Scripted demo scenarios.
 *
 * Each one exists to make a specific property of the runtime visible. They are
 * data, not prose, so the console can drive them and the click path cannot
 * drift from what the code actually does.
 */

export const DEMO_SCENARIOS = ['A', 'B', 'C', 'D'] as const;
export type DemoScenarioId = (typeof DEMO_SCENARIOS)[number];

export interface DemoStep {
  readonly screen: 'traveler' | 'studio' | 'inspector' | 'audit';
  readonly action: string;
  readonly expect: string;
}

export interface DemoScenario {
  readonly id: DemoScenarioId;
  readonly title: string;
  /** The single claim this scenario proves. */
  readonly proves: string;
  /** Matched against the seeded anchor by email, so it survives a reseed. */
  readonly customerEmail: string;
  readonly trigger: SimulatorScenario | null;
  readonly steps: readonly DemoStep[];
  readonly talkTrack: string;
}

export const DEMO_SCRIPT: readonly DemoScenario[] = [
  {
    id: 'A',
    title: 'Flight Cancellation Recovery',
    proves: 'The full eight-stage control loop runs end to end on a real disruption.',
    customerEmail: 'priya@journeyos.dev',
    trigger: 'flight_cancelled',
    steps: [
      {
        screen: 'studio',
        action: 'Select the Gold customer, fire “Flight cancelled (BLR → CDG)”.',
        expect: 'Journey flips to disrupted; the context graph builds to 16 nodes at depth 3.',
      },
      {
        screen: 'studio',
        action: 'Press “Run planner”.',
        expect: 'Four ranked options with per-dimension scores and a confidence value.',
      },
      {
        screen: 'inspector',
        action: 'Open the Decision Inspector.',
        expect: 'Tradeoff table shows what each alternative gave up, dimension by dimension.',
      },
      {
        screen: 'traveler',
        action: 'Accept the recommendation.',
        expect: 'Action executes through the Amadeus-shaped adapter; journey moves to recovering.',
      },
      {
        screen: 'audit',
        action: 'Open the Audit Viewer.',
        expect: 'Six stages recorded: event, context, plan, validate, approval, execute.',
      },
    ],
    talkTrack:
      'Everything you just saw was one event entering a runtime. No step was scripted — the graph, the ranking, and the ledger are all produced by the same code path that would run in production.',
  },

  {
    id: 'B',
    title: 'Trust Kernel Block',
    proves: 'Governance is enforced, not decorative — the system refuses to act.',
    customerEmail: 'anika@journeyos.dev',
    trigger: 'flight_cancelled',
    steps: [
      {
        screen: 'studio',
        action: 'Select the Silver customer who withheld automated-rebooking consent.',
        expect: 'Consent node renders in red: “email · automated rebooking · withheld”.',
      },
      {
        screen: 'studio',
        action: 'Set the Trust probe action to “Rebook flight”.',
        expect: 'Hard deny, with the reason stated in plain language.',
      },
      {
        screen: 'studio',
        action: 'Press “Run planner”.',
        expect: 'Every option is screened out before ranking; no action record is created.',
      },
    ],
    talkTrack:
      'Same event, same system, different customer. The AI never got to propose anything, because the Trust Kernel screens candidates before they reach the planner. Refusing to act is a first-class outcome, and it escalates to a human.',
  },

  {
    id: 'C',
    title: 'Multi-channel personalization',
    proves: 'One decision renders per channel, with consent enforced at the boundary.',
    customerEmail: 'priya@journeyos.dev',
    trigger: null,
    steps: [
      {
        screen: 'traveler',
        action: 'With a decision in place, open “What we would send”.',
        expect: 'Email, push, in-app, and agent brief rendered from one decision.',
      },
      {
        screen: 'traveler',
        action: 'Compare the customer copy with the agent handover brief.',
        expect: 'The agent sees the trust outcome, risk score, and policy version; the traveller does not.',
      },
    ],
    talkTrack:
      'The CMS owns the wording, JourneyOS owns the values. A channel the customer has not consented to is reported as suppressed with a reason — not quietly dropped.',
  },

  {
    id: 'D',
    title: 'Context Graph walkthrough',
    proves: 'Every recommendation is explainable down to the record that caused it.',
    customerEmail: 'priya@journeyos.dev',
    trigger: null,
    steps: [
      {
        screen: 'studio',
        action: 'Click the History node.',
        expect: '2 disruptions in 90 days, compensation within 30 days, risk contribution surfaced.',
      },
      {
        screen: 'studio',
        action: 'Click the Preference node.',
        expect: 'Stated priority — this is what selected the scoring weights.',
      },
      {
        screen: 'studio',
        action: 'Click a Consent node.',
        expect: 'Channel, purpose, grant state, and how old the grant is.',
      },
    ],
    talkTrack:
      'This is not a decorative diagram. Every node is a record that fed the decision, tagged with where it came from and how old it is. Prior journeys are three hops away, which is how history changes the outcome.',
  },
];

export function findScenario(id: DemoScenarioId): DemoScenario | undefined {
  return DEMO_SCRIPT.find((scenario) => scenario.id === id);
}
