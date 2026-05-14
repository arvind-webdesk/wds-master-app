## Why

The Dashboard Setup wizard today stops at Phase 1 — it extracts module specs from an uploaded SOW and writes Drizzle schema files, but leaves API routes, UI pages, and CASL wiring as manual work. Operators get a half-built module and must run multiple commands and agents to finish it. The opportunity is to close the loop: let the Anthropic SDK generate every layer of a module automatically, surface live progress in the wizard, and give operators a "Default vs Custom" toggle so they can choose between the fixed core set and a fully AI-driven, SOW-derived module set.

## What Changes

- **Dashboard Setup gains a mode switcher**: a "Default Modules" tab (current behaviour — fixed core set) and a "Custom Modules" tab (AI-driven from the uploaded SOW).
- **New OpenSpec generation pipeline**: after SOW extraction, the system uses the Anthropic SDK to create an OpenSpec change per module (proposal → design → specs → tasks), writing all artifact files to `openspec/changes/<slug>/`.
- **New full-stack scaffold engine** (`lib/sow/full-scaffold.ts`): uses Claude to generate Drizzle schema, API route handlers (`app/api/<slug>/route.ts` + `[id]/route.ts`), dashboard list + detail pages (`app/(dashboard)/<slug>/`), and CASL wiring (`lib/acl/` patches), then writes every file to disk.
- **New live progress panel** (`SowFullScaffoldPanel`): streams per-step status (schema → API → UI → CASL → migration hint) for each module so the operator can see exactly what was generated and what needs manual review.
- **New server action** `fullScaffoldModuleFromSpec` that orchestrates the pipeline and returns a streaming-friendly result.
- Existing `SowGeneratePanel` (schema-only) is preserved inside the Custom tab as "Phase 1" before the new "Phase 2" full-stack option.

## Capabilities

### New Capabilities

- `sow-mode-selection`: Dashboard Setup UI updated with a Default / Custom mode tab strip; each mode renders its own content panel and the wizard remembers which mode was active.
- `sow-openspec-generation`: Server-side pipeline that creates a complete OpenSpec change directory per extracted module using the Anthropic SDK — generates proposal.md, design.md, specs/<module>/spec.md, and tasks.md in one call sequence.
- `sow-full-stack-scaffold`: Full-stack code generation engine that produces Drizzle schema, Next.js App Router API routes, dashboard list/detail pages, and CASL permission wiring for each module, writing all files to disk; surfaces a post-run migration command reminder.
- `sow-progress-panel`: Real-time UI panel that shows step-by-step scaffold progress (per module, per layer), final file list, any warnings, and a one-click "copy migration command" action.

### Modified Capabilities

## Impact

- **New files**: `lib/sow/openspec-gen.ts`, `lib/sow/full-scaffold.ts`, `app/(dashboard)/settings/dashboard-setup/_components/SowModeSelector.tsx`, `app/(dashboard)/settings/dashboard-setup/_components/SowFullScaffoldPanel.tsx`, `app/(dashboard)/settings/dashboard-setup/full-scaffold-actions.ts`.
- **Modified files**: `SetupWizard.tsx` (adds mode state + tab strip), `SowGeneratePanel.tsx` (becomes Phase 1 inside Custom tab), `sow-actions.ts` (new `fullScaffoldModuleFromSpec` action).
- **New dependency**: none — `@anthropic-ai/sdk` and `openspec` CLI are already present.
- **No DB schema changes** — the generated module schemas are not registered until the operator runs `pnpm drizzle-kit migrate` (explicitly surfaced in the UI).
- **No breaking changes** to existing Default Modules flow or Phase 1 schema-only scaffolding.
