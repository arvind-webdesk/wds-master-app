/**
 * Cron helpers.
 *
 * cron-parser is NOT installed (only cronstrue is).  We use a strict
 * 5-field regex to validate cron expressions server-side, and cronstrue
 * for human-readable descriptions (client-safe — it is a pure-JS lib).
 */

/** Regex: exactly 5 whitespace-separated fields, each field being one of:
 *   *  /n  n  n-n  n,n  or combinations thereof
 *  This is intentionally permissive — structural only, no range-value check.
 *  The UI layer (cronstrue) gives richer feedback to the user.
 */
const CRON_FIELD = String.raw`(\*|[0-9*\/,\-]+)`
export const CRON_5_FIELD_RE = new RegExp(
  `^${CRON_FIELD}\\s+${CRON_FIELD}\\s+${CRON_FIELD}\\s+${CRON_FIELD}\\s+${CRON_FIELD}$`,
)

/**
 * Returns true if `expr` looks like a valid 5-field cron expression.
 * Used in Zod `.refine()` on the server side.
 */
export function isValidCronExpression(expr: string): boolean {
  return CRON_5_FIELD_RE.test(expr.trim())
}

/**
 * Returns a human-readable description using cronstrue.
 *
 * Safe to call on both server and client.
 * Returns null on any parse error so callers can show a fallback.
 */
export function describeCron(expr: string): string | null {
  try {
    // cronstrue is a CJS module; dynamic require keeps it out of the edge runtime.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cronstrue = require('cronstrue') as typeof import('cronstrue')
    return cronstrue.toString(expr)
  } catch {
    return null
  }
}

/**
 * Computes the next run time after `from` for the given cron expression.
 *
 * Because cron-parser is not installed, this is a STUB that returns null.
 * Replace with real cron-parser logic when the package is added:
 *
 *   import parser from 'cron-parser'
 *   const interval = parser.parseExpression(expr, { currentDate: from })
 *   return interval.next().toISOString()
 *
 * For now, the API stores null and the UI shows "—".
 */
export function computeNextRunAt(_expr: string, _from: Date = new Date()): string | null {
  // STUB — replace with cron-parser when installed.
  return null
}
