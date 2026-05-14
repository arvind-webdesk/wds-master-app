## ADDED Requirements

### Requirement: Login flow is tested end-to-end
The system SHALL have E2E tests for the `/login` page covering successful login, wrong password, unknown email, and empty-field validation.

#### Scenario: Successful login redirects to dashboard
- **WHEN** a user enters valid superadmin credentials and submits the login form
- **THEN** the browser navigates to `/dashboard` and the user's name or avatar is visible in the nav

#### Scenario: Wrong password shows inline error
- **WHEN** a user enters a valid email and an incorrect password
- **THEN** the login form displays an error message without redirecting

#### Scenario: Unknown email shows inline error
- **WHEN** a user enters an email that does not exist in the database
- **THEN** the login form displays an error message without redirecting

#### Scenario: Empty fields show validation errors
- **WHEN** a user submits the login form with both fields empty
- **THEN** field-level validation errors appear for email and password

### Requirement: Logout flow is tested end-to-end
The system SHALL have an E2E test that verifies logging out invalidates the session and redirects to `/login`.

#### Scenario: Logout clears session
- **WHEN** an authenticated user triggers logout (e.g., clicks the logout menu item)
- **THEN** the browser navigates to `/login` and navigating to `/dashboard` redirects back to `/login`

### Requirement: Forgot-password flow is tested end-to-end
The system SHALL have E2E tests for the forgot-password page covering successful submission and unknown email handling.

#### Scenario: Valid email submission shows confirmation
- **WHEN** a user enters a registered email on the forgot-password page and submits
- **THEN** a confirmation message is displayed (email sent) without revealing whether the email exists

#### Scenario: Unknown email still shows confirmation
- **WHEN** a user enters an unregistered email on the forgot-password page and submits
- **THEN** the same confirmation message is displayed (no enumeration of accounts)

#### Scenario: Empty email shows validation error
- **WHEN** a user submits the forgot-password form with no email
- **THEN** a field-level validation error appears

### Requirement: Reset-password flow is tested end-to-end
The system SHALL have E2E tests for the reset-password page covering a valid token, mismatched passwords, and an expired/invalid token.

#### Scenario: Valid token allows password reset
- **WHEN** a user visits a reset-password URL with a valid token and submits matching new passwords
- **THEN** the password is updated and the user is redirected to `/login` with a success message

#### Scenario: Mismatched passwords show validation error
- **WHEN** a user submits the reset-password form with passwords that do not match
- **THEN** a field-level error appears on the confirm-password field

#### Scenario: Invalid or expired token shows error
- **WHEN** a user visits a reset-password URL with a malformed or expired token
- **THEN** an appropriate error message is displayed (e.g., "Link is invalid or expired")

### Requirement: Unauthenticated users are redirected
The system SHALL redirect unauthenticated requests for protected routes to `/login`.

#### Scenario: Direct navigation to dashboard without session
- **WHEN** a browser with no session cookie navigates directly to `/dashboard`
- **THEN** the browser is redirected to `/login`
