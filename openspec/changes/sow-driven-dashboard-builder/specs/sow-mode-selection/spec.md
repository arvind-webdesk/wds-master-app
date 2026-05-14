## ADDED Requirements

### Requirement: Dashboard Setup Step 4 has a Default / Custom mode toggle
Step 4 (Modules) of the Setup Wizard SHALL display a tab strip or segmented control with two options: "Default Modules" and "Custom Modules". The selected mode SHALL determine which content panel is rendered below the toggle.

#### Scenario: Default mode is active on first visit
- **WHEN** an operator opens the Setup Wizard for the first time and reaches Step 4
- **THEN** the "Default Modules" tab is selected and the existing core-module checklist is visible

#### Scenario: Switching to Custom mode shows the SOW pipeline
- **WHEN** an operator clicks the "Custom Modules" tab
- **THEN** the core-module checklist hides and the SOW pipeline panels (ScopeUploader + SowGeneratePanel + SowFullScaffoldPanel) are rendered

#### Scenario: Mode state is preserved within the wizard session
- **WHEN** an operator switches to Custom mode and then navigates Back to Step 3 and returns to Step 4
- **THEN** the Custom tab is still selected and previous SOW extraction results are still visible

### Requirement: Default mode renders the existing module checklist unchanged
In Default mode, Step 4 SHALL render the same `enabledModules` checkbox grid that exists today — no changes to its behaviour or appearance.

#### Scenario: Default mode checklist persists to saved setup
- **WHEN** an operator saves the wizard while in Default mode
- **THEN** only the checked default modules are stored in the setup data

### Requirement: Custom mode does not affect the saved enabledModules field
Selecting Custom mode and generating modules via SOW SHALL NOT alter the `enabledModules` field in the saved setup. Generated modules become live via the scaffold pipeline (schema + API + UI) independently of the wizard's module checklist.

#### Scenario: Saving in Custom mode does not corrupt Default module selection
- **WHEN** an operator is in Custom mode and clicks "Save & finish setup"
- **THEN** the `enabledModules` value saved is whatever was set in Default mode (or the initial default), not an empty array
