## ADDED Requirements

### Requirement: OpenSpec artifacts are generated per extracted module
The system SHALL provide a server action `generateOpenSpecForModule(spec: ExtractedModuleSpec): Promise<OpenSpecGenResult>` that uses the Anthropic SDK to produce and write the four OpenSpec artifact files for a given module:
- `openspec/changes/<slug>/proposal.md`
- `openspec/changes/<slug>/design.md`
- `openspec/changes/<slug>/specs/<slug>/spec.md`
- `openspec/changes/<slug>/tasks.md`
- `openspec/changes/<slug>/.openspec.yaml` (scaffold file, schema: spec-driven)

#### Scenario: Successful generation writes all artifact files
- **WHEN** `generateOpenSpecForModule` is called with a valid `ExtractedModuleSpec`
- **THEN** all five files are written to disk, the action returns `{ ok: true, changeName: slug, files: [...] }`, and the files contain coherent content derived from the module spec

#### Scenario: Pre-flight check fails when API key is missing
- **WHEN** `generateOpenSpecForModule` is called and `ANTHROPIC_API_KEY` is not set in the environment
- **THEN** the action returns `{ ok: false, error: 'ANTHROPIC_API_KEY is not configured.' }` without making any API calls or writing any files

#### Scenario: Existing change directory is not overwritten by default
- **WHEN** `generateOpenSpecForModule` is called for a slug whose change directory already exists
- **THEN** the action returns `{ ok: false, error: 'Change openspec/changes/<slug>/ already exists.' }` unless `overwrite: true` is passed

#### Scenario: Generation uses structured JSON output
- **WHEN** Claude is prompted to generate an artifact
- **THEN** the Anthropic SDK call uses `output_config.format.type = 'json_schema'` so the response is guaranteed to parse as valid JSON, matching the artifact's expected structure

### Requirement: Generated OpenSpec changes use the spec-driven schema
The `.openspec.yaml` written by the generator SHALL declare `schema: spec-driven` so the change is compatible with all existing `openspec` CLI commands (`openspec status`, `openspec instructions`, `openspec instructions apply`).

#### Scenario: Generated change is usable by the CLI
- **WHEN** `openspec status --change <slug>` is run after generation
- **THEN** the CLI reports 4/4 artifacts complete and `state: all_done`

### Requirement: tasks.md marks all tasks as pre-completed
Since the full-stack scaffold engine writes the actual code files rather than the agent pipeline, the generated `tasks.md` SHALL mark every task checkbox as `[x]` (done) so the OpenSpec change reflects what was already built.

#### Scenario: Pre-completed tasks do not block archive
- **WHEN** the operator runs `/opsx:archive <slug>` after generation
- **THEN** the archive command succeeds without prompting for incomplete tasks
