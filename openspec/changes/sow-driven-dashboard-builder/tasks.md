## 1. OpenSpec Generation Engine

- [ ] 1.1 Create `lib/sow/openspec-gen.ts` with `generateOpenSpecForModule(spec, options)` function
- [ ] 1.2 Implement pre-flight API key check — return early with clear error if `ANTHROPIC_API_KEY` is missing
- [ ] 1.3 Implement change directory creation: write `.openspec.yaml` with `schema: spec-driven` and `name: <slug>`
- [ ] 1.4 Use Anthropic SDK (structured JSON output) to generate `proposal.md` content for the module
- [ ] 1.5 Use Anthropic SDK to generate `design.md` content (data model, API surface, CASL wiring decisions)
- [ ] 1.6 Use Anthropic SDK to generate `specs/<slug>/spec.md` content (ADDED Requirements with scenarios)
- [ ] 1.7 Use Anthropic SDK to generate `tasks.md` content — all tasks pre-marked `[x]` (already built by scaffold)
- [ ] 1.8 Write all five artifact files to disk; return `OpenSpecGenResult` with file list and `ok: boolean`
- [ ] 1.9 Guard against existing change directory: return conflict error unless `overwrite: true`

## 2. Full-Stack Scaffold Engine

- [ ] 2.1 Create `lib/sow/full-scaffold.ts` with `fullScaffoldModule(spec, options)` orchestrator
- [ ] 2.2 Implement **Schema layer**: reuse `scaffoldSchemaForModule` from `lib/sow/scaffold.ts` (already exists — call it, don't duplicate)
- [ ] 2.3 Implement **API routes layer**: write a focused system prompt + JSON schema for `route.ts` (list + create) and `[id]/route.ts` (get + patch + delete); call Anthropic SDK; write files to `app/api/<slug>/`
- [ ] 2.4 Implement **UI pages layer**: write system prompt for list page (DataTable) and detail/edit page (RHF + Zod); call Anthropic SDK; write files to `app/(dashboard)/<slug>/`
- [ ] 2.5 Implement **CASL hint layer**: write `lib/acl/hints/<slug>.ts` — a comment file listing Subject name, moduleToSubject entry, and seed rows to add manually
- [ ] 2.6 Return `FullScaffoldResult` with a `layers` array (name, ok, files, error, warnings per layer)
- [ ] 2.7 Respect `options.overwrite` — skip (not overwrite) existing files when `false`; each layer independently checks for file existence before writing

## 3. Server Actions

- [ ] 3.1 Add `generateOpenSpecForModule` server action to `full-scaffold-actions.ts` (new file) — wraps `lib/sow/openspec-gen.ts`, enforces superadmin auth check
- [ ] 3.2 Add `fullScaffoldModuleFromSpec` server action to `full-scaffold-actions.ts` — wraps `lib/sow/full-scaffold.ts`, enforces superadmin auth check
- [ ] 3.3 Export `maxDuration = 120` from `full-scaffold-actions.ts` to increase server action timeout

## 4. Mode Selection UI

- [ ] 4.1 Add `sowMode` state (`'default' | 'custom'`) to `SetupWizard` with initial value `'default'`
- [ ] 4.2 Render a tab strip / segmented control at the top of Step 4 with "Default Modules" and "Custom Modules" options
- [ ] 4.3 Wrap the existing `enabledModules` checklist in `{sowMode === 'default' ? ... : null}`
- [ ] 4.4 Wrap the SOW pipeline panels (`ScopeUploader`, `SowGeneratePanel`, `SowFullScaffoldPanel`) in `{sowMode === 'custom' ? ... : null}`
- [ ] 4.5 Ensure mode switch does not clear the `enabledModules` form field value

## 5. SowFullScaffoldPanel Component

- [ ] 5.1 Create `app/(dashboard)/settings/dashboard-setup/_components/SowFullScaffoldPanel.tsx`
- [ ] 5.2 Accept `docs`, `disabled`, and `extractedModules` (the `SpecRow[]` from `SowGeneratePanel`) as props
- [ ] 5.3 Render one module card per extracted spec with: display name, slug, field count, "Full scaffold" button, "Generate OpenSpec" button
- [ ] 5.4 On "Full scaffold" click: call `fullScaffoldModuleFromSpec`, show spinner, then render layer status list (Schema, API Routes, UI Pages, CASL Hint) with ✓/✗ per layer and file list
- [ ] 5.5 On "Generate OpenSpec" click: call `generateOpenSpecForModule`, show spinner, then show success path or conflict warning
- [ ] 5.6 After any successful Schema layer: show migration reminder banner with copy-to-clipboard button for `pnpm drizzle-kit generate && pnpm drizzle-kit migrate`
- [ ] 5.7 Disable all scaffold buttons when parent `disabled` prop is true

## 6. Wire SowFullScaffoldPanel into SetupWizard

- [ ] 6.1 Import `SowFullScaffoldPanel` in `SetupWizard.tsx`
- [ ] 6.2 Pass `extractedModules` state (lifted from `SowGeneratePanel`) down to `SowFullScaffoldPanel` — lift the `rows: SpecRow[]` state up to `SetupWizard` so both panels share it
- [ ] 6.3 Place `SowFullScaffoldPanel` below `SowGeneratePanel` inside the Custom mode section of Step 4

## 7. Verify

- [ ] 7.1 Run `pnpm typecheck` — fix any type errors in new files
- [ ] 7.2 Manually test: upload a SOW, extract modules, run "Full scaffold" on one module, verify all four file layers are written to disk
- [ ] 7.3 Manually test: run "Generate OpenSpec", verify `openspec status --change <slug>` shows all artifacts complete
- [ ] 7.4 Verify mode toggle switches between Default and Custom panels without losing form data
- [ ] 7.5 Verify migration reminder appears after a successful schema scaffold and the copy button works
