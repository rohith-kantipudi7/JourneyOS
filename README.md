# JourneyOS

**The operating system for customer journeys.**

An event-driven, trust-governed orchestration runtime. AI proposes, deterministic policy authorizes, typed adapters execute.

Built for **Beyond GenAI — Crafting the Future of Customer-Facing Enterprise Applications** (Amadeus × Contentstack).

---

## The problem

An enterprise has a CRM, a booking system, a loyalty platform, a CMS, a support desk. Each owns a fragment of the customer experience. **None owns the journey.**

So when a flight is cancelled, the customer becomes the integration layer: call support, search alternatives, chase a voucher, rebook.

JourneyOS is a control plane that sits *above* those systems and answers one question continuously: **what should happen next for this customer?**

It is not a chatbot. The travel disruption story is the demo; the runtime is the product.

---

## The control loop

```
Event → Context → Trust Pre-Check → Plan (AI) → Validate → Approval → Execute → Audit
```

| Stage | What happens | Where |
|---|---|---|
| **Event** | Zod-validated, deduplicated by correlation id, attached to a journey | `src/events` |
| **Context** | Provenance-tagged graph snapshot, multi-hop across prior journeys | `src/core/journey` |
| **Trust** | Layered AND/OR/NOT policy, weighted 0–100 risk, tiered outcome | `src/core/trust`, `src/policies` |
| **Plan** | AI scores named dimensions; deterministic code ranks | `src/agents`, `src/core/decision` |
| **Validate** | Schema mismatch → whole proposal discarded | `src/agents/shared` |
| **Approval** | No action executes without a recorded approval | `src/services` |
| **Execute** | Typed adapters, idempotency keys | `src/adapters` |
| **Audit** | Append-only ledger of every stage | `src/db` |

**The AI never executes.** It emits per-dimension scores for options that have *already* passed policy screening. Ordering is plain arithmetic — identical scores always produce an identical ranking.

---

## Quick start

```bash
npm install
cp .env.example .env      # every variable is optional
npm run db:seed           # 42 customers, ~106 journeys, decisions pre-computed
npm run dev
```

Open <http://localhost:3000>.

JourneyOS runs **end-to-end with zero credentials**. Every missing integration has a deterministic fallback, and the console reports which path is live.

| Integration | With credentials | Without |
|---|---|---|
| Decision Planner | Azure OpenAI or OpenAI | Deterministic rule-based planner |
| Content Composer | Contentstack Delivery API | Local JSON template library |
| Travel | Amadeus-shaped adapter | Simulated inventory from real route data |

---

## The four screens

| Screen | Purpose |
|---|---|
| **Traveler** (`/`) | What the customer sees: journey, recommendation, accept/decline |
| **Journey Studio** (`/studio`) | Operator view: live context graph, event simulator, trust verdict |
| **Decision Inspector** (`/inspector`) | Why this option won — per-dimension tradeoff table |
| **Audit Viewer** (`/audit`) | Full trace, filterable by control-loop stage |

All four stay on the same journey; the context graph is present on every one.

---

## Demo scenarios

Run these from the console. Full click paths in [docs/ROADMAP.md](docs/ROADMAP.md).

**A · Flight Cancellation Recovery** — the happy path. Fire *Flight cancelled*, watch the graph build, run the planner, approve, watch the ledger fill with all six stages.

**B · Trust Kernel Block** — the one that matters. Pick the customer who withheld automated-rebooking consent, set the Trust probe to *Rebook flight* → **hard deny**, escalated to a human. Governance is not decorative.

**C · Multi-channel personalization** — one decision rendered as email, push, in-app, and an agent handover brief. Non-consented channels are reported as *suppressed with a reason*, not silently dropped.

**D · Context Graph walkthrough** — click nodes to show which event, preference, consent, and prior incident fed the decision.

---

## What makes this more than CRUD

**Trust is layered, not boolean.** Policies compose via explicit `AND`/`OR`/`NOT`:

```
(tier is Gold OR fewer than 2 disruptions in 90 days) AND spend is within the tier cap
```

Evaluation returns a **trace**, not a verdict — so the UI can say *"Customer is gold, not Platinum"* instead of *"policy failed"*. Outcomes are tiered: `auto_approve` / `needs_customer_approval` / `hard_deny`.

**Context is multi-hop.** The graph traverses prior journeys to compute a `PriorIncidentSummary` — *"2 disruptions in 90 days, voucher issued 19 days ago"*. Two customers, identical event, different outcome.

**Reasoning is reproducible.** Every decision pins the exact snapshot id it was derived from. The AI supplies scores; deterministic code ranks. A test asserts ordering is independent of input order.

**Idempotency is enforced by the database.** Unique indexes on `events.correlation_id` and `actions.idempotency_key`, so duplicate protection survives an application bug.

**Freshness is targeted.** A cancellation notice is a durable fact; travel inventory expires in 5 minutes. Budgets are per source system, and staleness is reported per node rather than as a blanket flag.

---

## Architecture

```
src/
  app/         Next.js routes — four screens + API
  components/  Presentation only (ESLint-enforced: no db/adapter/agent imports)
  core/        Domain logic — Trust Kernel, context graph, decision scoring
  agents/      Sense / Planning / Content — prompts + schemas, proposal only
  events/      Event schemas + gateway
  policies/    Declarative rules, predicates, risk model
  adapters/    Travel, Contentstack, notification, escalation
  db/          Drizzle schema, repositories, seed + generator
  services/    Composition layer
  types/       One canonical type per entity, plus ports
  tests/       Vitest unit + integration
```

Architectural boundaries are **lint rules, not conventions**: the Trust Kernel cannot import `openai`, agents cannot import execution adapters, components cannot import the database.

### Data

The 42-customer population is **generated, not hand-written** — from real IATA airports (with coordinates), real carriers (hubs, alliances, published punctuality, CO₂ intensity), and a seeded PRNG. Route distance is haversine; block time, fare, and emissions derive from it.

Six scripted anchors exist for the demo narrative; everything else is synthetic.

---

## Commands

```bash
npm run dev          # dev server
npm run build        # production build
npm run verify       # typecheck + lint + test
npm run db:seed      # wipe and repopulate, then run the pipeline
npm run db:reset     # empty every table
npm run db:studio    # Drizzle Studio
```

---

## Stack

Next.js 15 (App Router) · TypeScript strict · Tailwind v4 · SQLite via libSQL + Drizzle · Zod · Vitest · Azure OpenAI / OpenAI

---

## Status

189 tests. `npm run verify` is the gate — typecheck, lint, and tests must all pass.

Build progress and design decisions are tracked in [docs/ROADMAP.md](docs/ROADMAP.md).
