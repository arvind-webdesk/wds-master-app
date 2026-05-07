'use server'

import { getSessionUser } from '@/lib/auth/session'
import { extractModulesFromScope, type ExtractResult, type ExtractedModuleSpec } from '@/lib/sow/extract'
import { scaffoldSchemaForModule, type ScaffoldResult } from '@/lib/sow/scaffold'

export interface ExtractActionResult {
  ok:     boolean
  result?: ExtractResult
  error?: string
}

export async function extractModulesFromSow(documentIds: number[]): Promise<ExtractActionResult> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: 'Sign in first.' }

  if (user.userType !== 'superadmin') {
    return { ok: false, error: 'Dashboard Setup is restricted to super admins.' }
  }

  if (!Array.isArray(documentIds) || documentIds.length === 0) {
    return { ok: false, error: 'Upload at least one scope document first.' }
  }
  const cleaned = documentIds.filter((n) => Number.isInteger(n) && n > 0).slice(0, 20)
  if (cleaned.length === 0) return { ok: false, error: 'No valid document ids supplied.' }

  try {
    const result = await extractModulesFromScope(cleaned)
    return { ok: true, result }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.startsWith('ANTHROPIC_API_KEY')) {
      return { ok: false, error: message }
    }
    console.error('[extractModulesFromSow]', message)
    return { ok: false, error: 'Extraction failed. Check the server logs for details.' }
  }
}

export interface ScaffoldActionResult {
  ok:     boolean
  spec?:   ExtractedModuleSpec
  outcome?: ScaffoldResult
  error?: string
}

export async function scaffoldModuleFromSpec(
  spec: ExtractedModuleSpec,
  options: { overwrite?: boolean } = {},
): Promise<ScaffoldActionResult> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: 'Sign in first.' }

  if (user.userType !== 'superadmin') {
    return { ok: false, error: 'Dashboard Setup is restricted to super admins.' }
  }

  // Re-validate the spec server-side.
  if (!spec || typeof spec !== 'object') return { ok: false, error: 'Invalid module spec.' }
  if (!/^[a-z0-9-]{3,40}$/.test(spec.slug)) return { ok: false, error: 'Invalid slug.' }
  if (!Array.isArray(spec.fields) || spec.fields.length === 0) return { ok: false, error: 'Module spec has no fields.' }

  try {
    const outcome = await scaffoldSchemaForModule(spec, options)
    return { ok: outcome.ok, spec, outcome, error: outcome.ok ? undefined : outcome.error }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[scaffoldModuleFromSpec]', message)
    return { ok: false, error: 'Scaffolding failed. Check the server logs for details.' }
  }
}
