# JourneyOS — Copilot Instructions

JourneyOS is a **customer journey orchestration platform**, not a chatbot, travel planner, or support assistant. The travel-disruption flow is only the demo; the reusable runtime is the product. Read [docs/JOURNEYOS_PRODUCT_VISION.md](../docs/JOURNEYOS_PRODUCT_VISION.md), [docs/COPILOT_BUILD_SPECIFICATION.md](../docs/COPILOT_BUILD_SPECIFICATION.md), and [docs/ROADMAP.md](../docs/ROADMAP.md) before making changes.

## Control loop (never collapse this into a single prompt)

```
Event → Journey Context Builder → Trust Kernel pre-check → Decision Planner (AI) →
Zod validation → Customer approval → Typed action adapter → Audit ledger
```

- **AI proposes, it never executes.** Agents only produce structured proposals; execution belongs to the Action Runtime.
- The **Trust Kernel** (`src/policies` + `src/core/trust`) is 100% deterministic TypeScript — no LLM calls inside it. It checks consent, policy, freshness, and risk before any action can run.
- Every external system (travel, Contentstack, CRM, notifications, human escalation) is called through a **typed adapter** in `src/adapters` — never directly from agents, routes, or UI components.
- Every action carries an idempotency key; every significant operation writes an `audit_records` row.

## Repository layout

```
src/app/        Next.js routes (UI + route handlers)
src/components/ UI components (no business logic here)
src/core/       Domain logic: Trust Kernel, Journey orchestration, Result/branded-ID helpers
src/agents/     Sense / Planning / Content / Action agent prompts + schemas
src/events/     Event type Zod schemas + Event Gateway
src/policies/   Declarative policy definitions consumed by the Trust Kernel
src/adapters/   Typed adapters: travel (Amadeus-shaped), Contentstack, CRM, notification, human escalation
src/db/         Drizzle schema, migrations, repositories, seed data
src/types/      Shared domain interfaces (Customer, Journey, Event, Decision, Action, Consent, AuditRecord)
src/lib/        Cross-cutting utilities
src/hooks/      React hooks
src/services/   Application services composing repositories + adapters
src/tests/      Vitest unit/integration tests
```

## Coding rules

**Always:**
- TypeScript strict mode, no `any`
- Zod validation at every boundary (API input, AI output, event payloads)
- Interfaces for all ports (adapters, repositories) with dependency injection — no hardcoded singletons
- Repository pattern for all persistence access (never call Drizzle directly from routes/components)
- Structured, schema-locked AI outputs (`bestOption`, `alternatives`, `confidence`, `reasoning`, `evidence`) — never free-form text
- Deterministic fallback path when an AI call fails or fails validation

**Avoid:**
- Business logic inside UI components
- Hardcoded prompts scattered across files — centralize in `src/agents`
- Duplicate domain models — one canonical type per entity in `src/types`
- Large files — split by responsibility (event schema, policy, adapter, repository, service)
- Bypassing the Trust Kernel for any state-changing action

## Progress tracking

[docs/ROADMAP.md](../docs/ROADMAP.md) is the single source of truth for build status. When a phase's acceptance criteria are met, tick its checkboxes and flip its status in the tracker table — don't mark a phase complete based on code existing alone.
