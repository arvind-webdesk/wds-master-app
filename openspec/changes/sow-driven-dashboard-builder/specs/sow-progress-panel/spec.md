## ADDED Requirements

### Requirement: SowFullScaffoldPanel shows per-module, per-layer progress
The `SowFullScaffoldPanel` component SHALL display a card per extracted module spec. Each card shows: module name, slug, a "Full scaffold" button, and — after scaffolding runs — a layer-by-layer status list (Schema, API Routes, UI Pages, CASL Hint) with pass/fail indicators and the list of files written.

#### Scenario: Before scaffolding, card shows only metadata and button
- **WHEN** the panel renders with extracted module specs and no scaffold has been run
- **THEN** each module card shows the display name, slug, field count, and an enabled "Full scaffold" button

#### Scenario: During scaffolding, button becomes disabled with spinner
- **WHEN** the operator clicks "Full scaffold" on a module card
- **THEN** the button shows a spinner and the label changes to "Scaffolding…" while the server action is in flight

#### Scenario: After scaffolding, all four layers are shown with status
- **WHEN** `fullScaffoldModuleFromSpec` resolves
- **THEN** the card expands to show four layer rows: Schema, API Routes, UI Pages, CASL Hint — each with a green check (success) or red X (failure), a file list for successes, and an error message for failures

### Requirement: Panel surfaces the migration reminder after any successful scaffold
After at least one module is scaffolded successfully, the panel SHALL display a persistent notice: "Run `pnpm drizzle-kit generate && pnpm drizzle-kit migrate` to apply schema changes."

#### Scenario: Migration notice appears after first successful scaffold
- **WHEN** the Schema layer for any module completes with `ok: true`
- **THEN** a migration reminder banner becomes visible at the bottom of the panel

#### Scenario: Migration command can be copied to clipboard
- **WHEN** the operator clicks the copy icon next to the migration command
- **THEN** `pnpm drizzle-kit generate && pnpm drizzle-kit migrate` is written to the clipboard and a toast confirms "Copied to clipboard"

### Requirement: Panel provides an OpenSpec generation button per module
Each module card SHALL also include a secondary "Generate OpenSpec" button that, when clicked, calls `generateOpenSpecForModule` and shows a success state with a link to the generated change directory.

#### Scenario: Generate OpenSpec creates change artifacts
- **WHEN** the operator clicks "Generate OpenSpec" on a module card
- **THEN** the action is called, and on success the card shows "OpenSpec created at openspec/changes/<slug>/" with a note to run `/opsx:apply <slug>`

#### Scenario: Existing change shows a warning instead of overwriting
- **WHEN** `generateOpenSpecForModule` returns `{ ok: false, error: 'already exists' }`
- **THEN** the card shows a warning: "Change already exists — delete it manually to regenerate" (no silent overwrite)

### Requirement: Panel is disabled while other wizard operations are pending
The "Full scaffold" and "Generate OpenSpec" buttons in `SowFullScaffoldPanel` SHALL be disabled whenever the parent `SetupWizard`'s `pending` state is true (i.e. the save action is in flight).

#### Scenario: Scaffold buttons disabled during form save
- **WHEN** the operator clicks "Save & finish setup" and the wizard's `pending` state becomes true
- **THEN** all scaffold and OpenSpec buttons in the panel are disabled until the save resolves
