import type { FieldValues, UseFormReturn, FieldPath } from 'react-hook-form'

/**
 * Project-wide pattern for surfacing server-side form errors back to the user.
 *
 * Every API route or server action that validates user input MUST return
 * errors in this envelope when it can identify the offending field(s):
 *
 *   {
 *     error: {
 *       code:        string                          // machine-readable, e.g. 'VALIDATION_ERROR'
 *       message:     string                          // human-readable summary; safe to show
 *       fieldErrors?: Record<string, string>         // { 'email': 'Email is required' }
 *     }
 *   }
 *
 * Server actions that don't go through HTTP can return the same shape flat:
 *
 *   { ok: false, fieldErrors?: Record<string, string>, friendlyError?: string }
 *
 * The client uses `applyServerErrors()` to map fieldErrors onto each input
 * via react-hook-form's `setError()`. Anything left over goes to the form
 * `root` error so the form can show ONE inline alert at the top.
 *
 * Why both inline and root: per-field FormMessage tells the user *which*
 * input is wrong; the root alert covers cross-field errors, auth failures,
 * and "something else broke" cases that don't map cleanly to one input.
 *
 * Anti-pattern (DO NOT DO THIS):
 *   if (!res.ok) {
 *     toast.error(data.error?.message)   // user clicks away — message is gone
 *     return
 *   }
 *
 * The error must land *on the form* so it survives a misclick and so screen
 * readers announce it. Toast is fine as a *secondary* notice for transient
 * connectivity issues, not as the primary surface for validation errors.
 */

export interface ServerErrorPayload {
  /** Machine-readable code: 'VALIDATION_ERROR', 'UNAUTHORIZED', 'CONFLICT', etc. */
  code?:        string
  /** Human-readable summary. */
  message?:     string
  /** Map of dotted field paths → user-facing error messages. */
  fieldErrors?: Record<string, string>
}

export interface ApplyServerErrorsOptions<T extends FieldValues> {
  /**
   * If the payload has only a top-level `message` and no `fieldErrors`, attach
   * the message to this field. Useful for auth: a 401 "Invalid email or
   * password" naturally lives on the password input.
   */
  fallbackField?: FieldPath<T>
  /** Whether to also call `setError('root', ...)` so a form-wide alert can render. Default true. */
  setRootError?: boolean
}

/**
 * Apply a `ServerErrorPayload` to a react-hook-form instance.
 *
 * - Each `fieldErrors[k]` becomes `form.setError(k, { message })`.
 * - If `fallbackField` is supplied AND no `fieldErrors` were provided AND the
 *   payload has a top-level `message`, the message also lands on that field
 *   (so the user sees the error inline next to the most-relevant input).
 * - The top-level `message` is always also attached to `root` so the form
 *   can render one alert at the top via `errors.root?.message`.
 *
 * Returns the message string, or null if nothing to display.
 */
export function applyServerErrors<T extends FieldValues>(
  form: UseFormReturn<T>,
  payload: ServerErrorPayload | null | undefined,
  options: ApplyServerErrorsOptions<T> = {},
): string | null {
  if (!payload) return null
  const { fallbackField, setRootError = true } = options
  const message = payload.message?.trim() || null

  let mapped = 0
  if (payload.fieldErrors) {
    for (const [path, msg] of Object.entries(payload.fieldErrors)) {
      if (!msg) continue
      try {
        form.setError(path as FieldPath<T>, { type: 'server', message: msg })
        mapped++
      } catch {
        // ignore — RHF throws if the path doesn't exist on the form schema.
      }
    }
  }

  if (mapped === 0 && fallbackField && message) {
    try {
      form.setError(fallbackField, { type: 'server', message })
    } catch {
      // ignore
    }
  }

  if (setRootError && message) {
    try {
      form.setError('root', { type: 'server', message })
    } catch {
      // ignore
    }
  }

  return message
}

/**
 * Best-effort decode of a non-OK fetch response into a `ServerErrorPayload`.
 * Tolerates: JSON envelope `{ error: {...} }`, raw text, or empty body.
 */
export async function parseFetchError(res: Response): Promise<ServerErrorPayload> {
  try {
    const text = await res.text()
    if (!text) return { message: `Request failed with status ${res.status}` }
    try {
      const json = JSON.parse(text) as { error?: ServerErrorPayload }
      if (json && typeof json === 'object' && json.error) return json.error
    } catch {
      return { message: text.slice(0, 300) }
    }
    return { message: `Request failed with status ${res.status}` }
  } catch {
    return { message: `Request failed with status ${res.status}` }
  }
}

/**
 * Build a `fieldErrors` object from a flattened Zod error path/message list.
 * Use inside API routes / server actions to translate `parsed.error.issues`
 * into the standard envelope shape.
 *
 *   const fieldErrors = zodIssuesToFieldErrors(parsed.error.issues)
 */
export function zodIssuesToFieldErrors(
  // Use PropertyKey[] to match Zod 4's `$ZodIssue.path` (which can include
  // symbols). Symbols are stringified with String(); they shouldn't appear in
  // form-validated objects but the type system doesn't know that.
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of issues) {
    const path = issue.path.map((p) => String(p)).join('.')
    if (!path) continue
    if (!out[path]) out[path] = issue.message
  }
  return out
}
