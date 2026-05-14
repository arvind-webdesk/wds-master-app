## Context

The existing Dashboard Setup wizard (`SetupWizard.tsx`) has a "Custom modules from your SOW" section (Step 4 — Modules) backed by `SowGeneratePanel`. That panel today does two things: (1) calls `extractModulesFromSow` to get a list of module specs from the SOW via Claude, and (2) lets the operator scaffold each spec into a Drizzle schema file via `scaffoldModuleFromSpec → lib/sow/scaffold.ts`. The pipeline stops there. API routes, UI pages, and CASL wiring are left to manual skill invocations after the wizard closes.

The Anthropic SDK (`@anthropic-ai/sdk`) is already wired in `lib/sow/anthropic-client.ts` using `SOW_MODEL`. The OpenSpec CLI (`openspec`) is available globally on the server path (the harness installs it).

## Goals / Non-Goals

**Goals:**
- Add a Default / Custom mode toggle to Dashboard Setup Step 4.
- For Custom mode: generate a complete OpenSpec change directory (all 4 artifacts) per extracted module using the Anthropic SDK.
- For Custom mode: run the full-stack scaffold pipeline (schema → API routes → UI pages → CASL) per module, writing files to disk, using Claude as the code-generation engine.
- Show a live step-by-step progress panel in the UI so the operator sees what was generated and what needs manual review (i.e. running migrations).
- Preserve the existing Default Modules (fixed core set) and Phase 1 schema-only flows unchanged.

**Non-Goals:**
- Auto-running `drizzle-kit migrate` — always left to the operator.
- Auto-pushing or deploying generated code.
- Streaming partial tokens to the browser (full responses only; streaming adds significant complexity for little UX gain here).
- Generating tests automatically (Playwright suite handles that separately).
- Supporting non-superadmin users triggering scaffolding.

## Decisions

### 1. OpenSpec artifact generation via Anthropic SDK, not the CLI

**Decision:** `lib/sow/openspec-gen.ts` uses the Anthropic SDK to ask Claude to produce each artifact file's content (proposal.md, design.md, specs/<slug>/spec.md, tasks.md) as a structured JSON response, then writes the files directly with `node:fs`.

**Rationale:** The OpenSpec CLI (`openspec new change`, `openspec instructions`) is a local dev tool that expects an interactive terminal and a workspace CWD; running it inside a Next.js server action via `child_process.exec` is fragile (PATH, cwd, stdout buffering). Generating artifact content with the SDK and writing files directly is the same pattern already proven in `lib/sow/scaffold.ts`.

**Alternative considered:** Spawn `openspec` CLI as a child process. Rejected — PATH is unpredictable in the Next.js server runtime, and the CLI's interactive prompts don't map to a server action context.

### 2. Full-stack scaffold via separate Claude calls per layer, not one mega-prompt

**Decision:** `lib/sow/full-scaffold.ts` makes one structured Anthropic call per code layer: (a) schema, (b) API route handlers, (c) dashboard list + detail pages, (d) CASL ability + permissions-map patches. Each call has a focused system prompt and a JSON schema for its output.

**Rationale:** A single call producing all four layers produces a very large output that is hard to validate and re-try if one layer fails. Per-layer calls let the engine report progress incrementally and retry a specific layer without redoing everything.

**Alternative considered:** One call, all layers. Rejected — output exceeds practical token budgets, validation is all-or-nothing, and UX cannot show granular progress.

### 3. Server actions return full result objects, not streaming

**Decision:** `fullScaffoldModuleFromSpec` is a Next.js `'use server'` action that awaits the complete pipeline and returns a `FullScaffoldResult`. The UI polls or awaits the promise normally.

**Rationale:** Server actions in Next.js App Router do not support streaming natively (RSC streaming is different and not composable with `'use server'` actions in React 19 at this time). The per-layer progress is communicated as an array of `LayerStatus` objects in the returned result, which the UI renders after the action resolves.

**Alternative considered:** Use a Route Handler + `ReadableStream`. Viable but requires managing connection keep-alive, retry logic, and CORS; significantly more complex for limited UX benefit given each module takes 15–30 s total.

### 4. Mode state lives in SetupWizard, not persisted to DB

**Decision:** The Default / Custom mode tab selection is `useState` local to `SetupWizard`. It does not round-trip to the server or alter the saved setup data model.

**Rationale:** The mode is a wizard-time UX choice, not a durable configuration property. The result of the Custom flow (generated files on disk) persists independently of the wizard state.

### 5. Progress panel is a new component, SowGeneratePanel is unchanged

**Decision:** `SowFullScaffoldPanel` is a new sibling component to `SowGeneratePanel`. Both live inside the Custom tab. Phase 1 (schema only) remains accessible for operators who want to review schema before committing to full-stack generation.

**Rationale:** Preserving Phase 1 gives operators a lower-commitment entry point. Not all operators will want to auto-generate UI — some may prefer to hand-write pages. Keeping the components separate respects the single-responsibility principle and avoids destabilising the existing flow.

## Risks / Trade-offs

- **Long server action duration** → Per-module full-stack scaffold takes ~15–30 s. Next.js server actions have a default 60 s timeout. For modules with many fields the prompt can push past this. Mitigation: set `export const maxDuration = 120` in the route/page config; scaffold modules one at a time (not in parallel).
- **Generated code quality** → Claude may produce code that typechecks but has runtime bugs. Mitigation: run `pnpm typecheck` output in the UI after generation; prompt the operator to review generated files before running migrations.
- **File conflicts** → If a schema or route file already exists, overwriting it silently is destructive. Mitigation: default `overwrite: false`; surface a conflict warning in the progress panel with an explicit "overwrite" checkbox.
- **OpenSpec artifact quality** → Claude-generated tasks.md may not perfectly match the actual files written, since the full-scaffold engine writes files directly bypassing the usual agent pipeline. Mitigation: mark the generated tasks as pre-completed; the OpenSpec change is informational (captures the "what was built") rather than a work-tracking artefact.
- **API key absent** → `ANTHROPIC_API_KEY` missing causes the action to fail after the user has already waited. Mitigation: pre-flight check in the server action; surface a clear error in the UI before any Claude calls are made.

## Open Questions

- Should the generated OpenSpec changes be auto-archived after the files are written, or left open for the operator to review and `/opsx:archive` manually?
- Should the mode selection (Default vs Custom) be persisted to `client_config` so it's remembered across sessions?
- For the CASL layer, is a full patch to `lib/acl/ability.ts` and `lib/acl/permissions-map.ts` safe to auto-apply, given those files are hand-edited? Consider writing a separate `lib/acl/<slug>-patch.ts` hint file instead.
