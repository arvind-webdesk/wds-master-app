---
name: form-validation
description: Project standard for form validation + server-error display. Use whenever you build, modify, or review ANY form (auth, settings, sheet, wizard step) or ANY API route / server action that validates user input and returns errors. Enforces "every error lands on the form, never only in a toast." Triggers on "login", "form", "validation", "field error", "API route", "Zod", "useForm", "react-hook-form", or any new file under app/(auth)/, app/(dashboard)/**/page.tsx, app/api/**/route.ts.
---

# Form validation — project standard

Every form in this project must surface validation errors **on the form** (per-field + an inline form-level alert), not only in a toast. Toasts can be cleared with a misclick and aren't read by screen readers — relying on them is the bug that prompted this skill.

This is non-negotiable for: login, forgot-password, reset-password, account settings, every CRUD sheet, the dashboard-setup wizard, and any future form.

## The contract

### 1. API routes / server actions return THIS envelope on error

```ts
// HTTP error response body (route handlers)
{
  error: {
    code:        'VALIDATION_ERROR' | 'UNAUTHORIZED' | 'CONFLICT' | 'FORBIDDEN' | ...
    message:     string                    // human-readable, safe to show inline
    fieldErrors?: Record<string, string>   // path → message; e.g. { 'email': '…' }
  }
}

// Server action result
{
  ok:           false
  fieldErrors?: Record<string, string>
  friendlyError?: string                   // top-level message
}
```

For Zod validation failures, **always** include `fieldErrors`. Use the helper:

```ts
import { zodIssuesToFieldErrors } from '@/lib/form-errors'

const parsed = schema.safeParse(body)
if (!parsed.success) {
  return NextResponse.json(
    {
      error: {
        message:     'Please correct the highlighted fields',
        code:        'VALIDATION_ERROR',
        fieldErrors: zodIssuesToFieldErrors(parsed.error.issues),
      },
    },
    { status: 422 },
  )
}
```

For auth-style "Invalid email or password" errors (where there is no real "field" but you want the error visible next to one), set `fieldErrors` explicitly so the input lights up:

```ts
return NextResponse.json(
  {
    error: {
      message:     'Invalid email or password',
      code:        'UNAUTHORIZED',
      fieldErrors: { password: 'Invalid email or password' },
    },
  },
  { status: 401 },
)
```

### 2. Forms apply errors with `applyServerErrors`

```tsx
import { applyServerErrors, parseFetchError } from '@/lib/form-errors'

function onSubmit(values: FormValues) {
  form.clearErrors()                              // clear stale errors first
  startTransition(async () => {
    let res: Response
    try {
      res = await fetch('/api/...', { method: 'POST', body: JSON.stringify(values) })
    } catch {
      const message = 'Could not reach the server. Check your connection and try again.'
      form.setError('root', { type: 'network', message })
      toast.error(message)                         // toast OK as a SECONDARY notice
      return
    }
    if (!res.ok) {
      const payload = await parseFetchError(res)
      applyServerErrors(form, payload, { fallbackField: 'password' })
      return                                       // do NOT toast; the form shows it
    }
    // success path
  })
}
```

For server actions the shape is flat — pass it directly:

```ts
const result = await saveSomething(values)
if (!result.ok) {
  applyServerErrors(form, {
    message:     result.friendlyError,
    fieldErrors: result.fieldErrors,
  })
  return
}
```

### 3. The form renders BOTH per-field and form-level errors

Per-field via `FormMessage` inside every `FormField`:

```tsx
<FormField
  control={form.control}
  name="email"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Email</FormLabel>
      <FormControl><Input type="email" autoComplete="email" {...field} /></FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

Form-level alert at the **top of the form**, reading from `errors.root`:

```tsx
const rootError = form.formState.errors.root?.message
// ...
<form onSubmit={form.handleSubmit(onSubmit)} noValidate>
  {rootError ? (
    <div
      role="alert"
      aria-live="polite"
      className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{rootError}</p>
    </div>
  ) : null}
  {/* fields */}
</form>
```

`applyServerErrors` populates both `root` and per-field automatically — you just have to render the alert.

## Required behaviors

Every form MUST:

1. **Call `form.clearErrors()` at the start of submit** so retrying after a fix doesn't leave stale field errors hanging.
2. **Use `noValidate` on `<form>`** so the browser's native bubble doesn't conflict with `FormMessage`.
3. **Set `autoComplete` on every input** (`email`, `current-password`, `new-password`, `name`, `tel`, `off`, …). Password managers depend on this.
4. **Render a root error region** even if you don't expect one — server errors sometimes have nowhere else to go.
5. **Show `FormMessage` under every input** — not just the first one. Missing `<FormMessage />` is the most common cause of "errors not showing."
6. **Disable the submit button while pending** so the user can't double-submit.

Forms MUST NOT:

- Surface a server validation error **only** to `toast`. Toast is fine alongside the form alert, but not as the sole channel.
- Throw away `data.error.fieldErrors` and only read `data.error.message`.
- Do their own ad-hoc field-error mapping. Use `applyServerErrors` so the behavior is uniform.
- Use `setError(field, ...)` without re-clearing on next submit.

## Quick checklist (apply before marking a form task done)

- [ ] Server returns `{ error: { code, message, fieldErrors? } }` (HTTP) or `{ ok: false, fieldErrors?, friendlyError? }` (server action)
- [ ] Zod failures → `zodIssuesToFieldErrors(issues)` populates `fieldErrors`
- [ ] Auth/credential errors carry `fieldErrors` keyed to the relevant input
- [ ] Client uses `applyServerErrors(form, payload, { fallbackField })`
- [ ] `form.clearErrors()` runs at submit start
- [ ] Form has a root error alert region tied to `errors.root?.message`
- [ ] Every `FormField` has a `<FormMessage />`
- [ ] Submit button disables while `pending`
- [ ] `noValidate` on `<form>`; `autoComplete` on every `<Input>`
- [ ] No "swallow → toast.error only" branches in `onSubmit`

## Reference implementations

These three are the canonical examples in the repo. New forms must match this shape:

- [app/(auth)/login/page.tsx](app/(auth)/login/page.tsx) — email + password, `fallbackField: 'password'`
- [app/(auth)/forgot-password/page.tsx](app/(auth)/forgot-password/page.tsx) — single email field, `fallbackField: 'email'`
- [app/(auth)/reset-password/page.tsx](app/(auth)/reset-password/page.tsx) — two-field with cross-field refine, `fallbackField: 'password'`

The helper itself: [lib/form-errors.ts](lib/form-errors.ts) — `applyServerErrors`, `parseFetchError`, `zodIssuesToFieldErrors`. Don't reinvent these.

## Common bugs this skill prevents

| Symptom | Root cause |
|---|---|
| "Login error doesn't show on the input" | `onSubmit` does `toast.error(...)` instead of `applyServerErrors(form, ...)` |
| "Errors persist after fixing the field" | Missing `form.clearErrors()` at submit start |
| "Server validation message vanishes" | API returns `error.message` only, no `fieldErrors`; client only inspected `error.message` |
| "Native browser tooltip fights my message" | `<form>` missing `noValidate` |
| "Password manager doesn't autofill" | Missing `autoComplete` |
| "Cross-field error has nowhere to land" | No root alert region; `setError('root', ...)` writes to nowhere |
