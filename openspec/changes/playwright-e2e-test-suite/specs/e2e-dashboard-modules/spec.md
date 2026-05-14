## ADDED Requirements

### Requirement: Users module is tested end-to-end
The system SHALL have E2E tests for the `/users` module covering list view, create, edit, activate/deactivate, and search.

#### Scenario: Users list renders seeded users
- **WHEN** an authenticated superadmin navigates to `/users`
- **THEN** the data table shows at least the seeded superadmin and viewer-role users

#### Scenario: Create user form submits successfully
- **WHEN** an authenticated superadmin fills the new-user form with valid data and submits
- **THEN** the new user appears in the users list

#### Scenario: Edit user form saves changes
- **WHEN** an authenticated superadmin opens an existing user's edit page, changes the name, and saves
- **THEN** the updated name is reflected in the list

#### Scenario: User list search filters results
- **WHEN** an authenticated superadmin types a partial email into the search field
- **THEN** only users matching that email are shown in the table

### Requirement: Roles module is tested end-to-end
The system SHALL have E2E tests for the `/roles` module covering list view, create, edit, and permission matrix interaction.

#### Scenario: Roles list renders seeded roles
- **WHEN** an authenticated superadmin navigates to `/roles`
- **THEN** the list shows at least the superadmin and viewer roles

#### Scenario: Create role and assign permissions
- **WHEN** an authenticated superadmin creates a new role and toggles at least one permission
- **THEN** the role appears in the roles list with the correct permission count

#### Scenario: Edit role name saves changes
- **WHEN** an authenticated superadmin edits an existing role's name and saves
- **THEN** the updated name is shown in the roles list

### Requirement: Connections module is tested end-to-end
The system SHALL have E2E tests for the `/connections` module covering list view, create, edit, delete, and connection test action.

#### Scenario: Connections list renders seeded connections
- **WHEN** an authenticated superadmin navigates to `/connections`
- **THEN** the data table shows any seeded connections (or an empty state message)

#### Scenario: Create connection form submits successfully
- **WHEN** an authenticated superadmin fills the new-connection form with valid data and submits
- **THEN** the new connection appears in the connections list

#### Scenario: Test connection action returns a status
- **WHEN** an authenticated superadmin clicks the "Test" action for an existing connection
- **THEN** a success or error status toast/message is displayed

#### Scenario: Delete connection removes it from the list
- **WHEN** an authenticated superadmin deletes a connection
- **THEN** the connection no longer appears in the list

### Requirement: Cron Sync module is tested end-to-end
The system SHALL have E2E tests for the `/cron-sync` module covering list view, create, edit, delete, and manual run.

#### Scenario: Cron sync list renders seeded jobs
- **WHEN** an authenticated superadmin navigates to `/cron-sync`
- **THEN** the data table shows seeded cron jobs (or an empty state)

#### Scenario: Create cron job submits successfully
- **WHEN** an authenticated superadmin fills the new-cron-job form and submits
- **THEN** the job appears in the cron-sync list

#### Scenario: Manual run triggers a job
- **WHEN** an authenticated superadmin clicks "Run Now" on a cron job
- **THEN** a toast or status indicator confirms the job was triggered

#### Scenario: Delete cron job removes it from the list
- **WHEN** an authenticated superadmin deletes a cron job
- **THEN** the job no longer appears in the list

### Requirement: Email Templates module is tested end-to-end
The system SHALL have E2E tests for the `/email-templates` module covering list view, create, edit, delete, and send-preview.

#### Scenario: Email templates list renders seeded templates
- **WHEN** an authenticated superadmin navigates to `/email-templates`
- **THEN** the list shows seeded templates (or an empty state)

#### Scenario: Create email template submits successfully
- **WHEN** an authenticated superadmin fills the new-template form with a subject and body and submits
- **THEN** the template appears in the email-templates list

#### Scenario: Edit template saves changes
- **WHEN** an authenticated superadmin edits an existing template's subject and saves
- **THEN** the updated subject is shown in the list

#### Scenario: Delete template removes it from the list
- **WHEN** an authenticated superadmin deletes a template
- **THEN** the template no longer appears in the list

### Requirement: Settings module is tested end-to-end
The system SHALL have E2E tests for the `/settings` module covering key/value editing and save.

#### Scenario: Settings page renders existing settings
- **WHEN** an authenticated superadmin navigates to `/settings`
- **THEN** known seeded setting keys and values are displayed

#### Scenario: Updating a setting value saves successfully
- **WHEN** an authenticated superadmin changes a setting value and saves
- **THEN** a success toast is shown and the new value persists on page reload

### Requirement: Activity Logs module is tested end-to-end
The system SHALL have E2E tests for the `/activity-logs` module covering list view and filtering.

#### Scenario: Activity logs list renders records
- **WHEN** an authenticated superadmin navigates to `/activity-logs`
- **THEN** the data table shows at least the login event generated during the test run

#### Scenario: Filtering by actor narrows results
- **WHEN** an authenticated superadmin filters activity logs by a specific user
- **THEN** only log entries for that user are shown

### Requirement: API Logs module is tested end-to-end
The system SHALL have E2E tests for the `/api-logs` module covering list view and detail view.

#### Scenario: API logs list renders records
- **WHEN** an authenticated superadmin navigates to `/api-logs`
- **THEN** the data table shows at least the API calls made during test setup

#### Scenario: Clicking a log row shows detail
- **WHEN** an authenticated superadmin clicks a log row
- **THEN** a detail view or modal displays request/response information

### Requirement: Sync History module is tested end-to-end
The system SHALL have E2E tests for the `/sync-history` module covering list view and status display.

#### Scenario: Sync history list renders records
- **WHEN** an authenticated superadmin navigates to `/sync-history`
- **THEN** the data table shows seeded sync history records (or an empty state)

#### Scenario: Status badges are visible
- **WHEN** the sync history list is displayed
- **THEN** each row shows a status badge (e.g., success, failed, pending)

### Requirement: CASL role-gated access is tested
The system SHALL have E2E tests that verify a viewer-role user cannot access or perform operations that require elevated permissions.

#### Scenario: Viewer cannot navigate to user management
- **WHEN** a viewer-role user is authenticated and navigates to `/users`
- **THEN** the page shows an access-denied message or redirects away

#### Scenario: Viewer cannot see create/delete actions
- **WHEN** a viewer-role user views a module they can read
- **THEN** the "New", "Edit", and "Delete" buttons or actions are not visible

### Requirement: Dashboard home page is tested
The system SHALL have an E2E test for the `/dashboard` page verifying summary widgets render without errors.

#### Scenario: Dashboard home renders key metrics
- **WHEN** an authenticated superadmin navigates to `/dashboard`
- **THEN** the page loads without errors and at least one metric widget or card is visible
