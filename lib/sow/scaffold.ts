import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import type Anthropic from '@anthropic-ai/sdk'
import { getAnthropicClient, SOW_MODEL } from './anthropic-client'
import type { ExtractedModuleSpec } from './extract'

/**
 * Scaffold a Drizzle schema file for one extracted module spec.
 *
 * Mirrors the work the `db-schema-builder` agent in master-dashboard-onboard
 * does today: takes a spec, asks Claude (with the same hard rules embedded as
 * a system prompt) to produce a single schema file, and writes it under
 * lib/db/schema/<slug>.ts. Also appends `export * from './schema/<slug>'` to
 * lib/db/index.ts.
 *
 * This function does NOT run drizzle-kit generate / migrate. The caller
 * surfaces a notice to the operator instead — review the diff before
 * applying. Re-running for a slug that already has a schema file refuses
 * (unless `overwrite: true`) so we don't clobber a hand-edited file.
 */

export interface ScaffoldResult {
  ok:          boolean
  schemaPath?: string
  pluralKey?:  string  // tableName / sidebar key
  /** Files we touched, relative to the project root. */
  touched?:    string[]
  error?:      string
  warnings?:   string[]
}

const SYSTEM_PROMPT = `You write Drizzle schema files for a SQLite/libsql
database (the wds-dashboard-next project). You never write code for Postgres
or Prisma.

Hard rules (project-specific):
1. Imports — only from drizzle-orm/sqlite-core:
     import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core'
     import { sql } from 'drizzle-orm'
2. Primary keys — integer('id').primaryKey({ autoIncrement: true })
3. Timestamps — always include the trio:
     createdAt: text('created_at').notNull().default(sql\`(CURRENT_TIMESTAMP)\`),
     updatedAt: text('updated_at').notNull().default(sql\`(CURRENT_TIMESTAMP)\`),
     deletedAt: text('deleted_at'),
4. Booleans — integer('flag', { mode: 'boolean' }).notNull().default(false)
5. Strings — text('name').notNull() (no varchar, no length)
6. Indexes — inside the 2nd-arg config, named "<tableName>_<col>_idx".
   Always add deleted_at_idx for soft-delete.
7. Type exports — both:
     export type X    = typeof <tableName>.$inferSelect
     export type NewX = typeof <tableName>.$inferInsert
8. NEVER emit pgTable, serial, varchar, timestamp(...), boolean(...), or
   import drizzle-orm/pg-core.

The user will give you a module spec. Produce ONE TypeScript file — the
schema file — and nothing else. No prose, no markdown fences, no comments
beyond the type-export JSDoc. The first line must be the import.

Use snake_case for column DB names, camelCase for the JS field name. Pick
SQLite-friendly types:
  type=text     → text(...)
  type=integer  → integer(...)
  type=real     → real(...)
  type=boolean  → integer(..., { mode: 'boolean' })
  type=datetime → text(...)  (ISO 8601 string)
  type=json     → text(...)  (JSON-serialized string)

Required fields → .notNull(). Index any column ending in _id, _at, status, or type.`

const SCHEMA_RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    fileContents: { type: 'string', description: 'Full TypeScript file body for lib/db/schema/<slug>.ts' },
    tableName:    { type: 'string', description: 'snake_case plural identifier used as the sqliteTable name (e.g. "support_tickets")' },
    exportName:   { type: 'string', description: 'camelCase plural identifier used as the const name (e.g. "supportTickets")' },
    typeName:     { type: 'string', description: 'Singular PascalCase type name (e.g. "SupportTicket")' },
    columns:      { type: 'array',  items: { type: 'string' } },
    indexes:      { type: 'array',  items: { type: 'string' } },
  },
  required: ['fileContents', 'tableName', 'exportName', 'typeName', 'columns', 'indexes'],
}

interface SchemaArtifact {
  fileContents: string
  tableName:    string
  exportName:   string
  typeName:     string
  columns:      string[]
  indexes:      string[]
}

export async function scaffoldSchemaForModule(
  spec: ExtractedModuleSpec,
  options: { overwrite?: boolean } = {},
): Promise<ScaffoldResult> {
  const root = path.resolve(process.cwd())
  const schemaPath = path.join('lib', 'db', 'schema', `${spec.slug}.ts`)
  const absSchema = path.resolve(root, schemaPath)

  if (!options.overwrite) {
    try {
      await access(absSchema)
      return {
        ok: false,
        error: `lib/db/schema/${spec.slug}.ts already exists — pass overwrite: true to replace it.`,
      }
    } catch {
      // good — file does not exist
    }
  }

  // Load the canonical example so Claude matches the project's exact style.
  let usersExample = ''
  try {
    usersExample = await readFile(path.join(root, 'lib/db/schema/users.ts'), 'utf8')
  } catch {
    /* fall back to the rules in the prompt alone */
  }

  const client = getAnthropicClient()

  const userText = [
    `Reference (the canonical schema file in this project):`,
    '```ts',
    usersExample.trim() || '// (could not load lib/db/schema/users.ts — follow the rules in the system prompt)',
    '```',
    '',
    `Module spec:`,
    JSON.stringify({ slug: spec.slug, displayName: spec.displayName, description: spec.description, fields: spec.fields }, null, 2),
    '',
    `Generate the schema file for this module. Add the standard id + ` +
    `timestamps + soft-delete columns automatically. Do not include any other ` +
    `commentary — the JSON envelope is the only output.`,
  ].join('\n')

  const response = await client.messages.create({
    model: SOW_MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userText }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA_RESULT_SCHEMA } },
    thinking: { type: 'adaptive' },
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()

  let parsed: SchemaArtifact
  try {
    parsed = JSON.parse(text) as SchemaArtifact
  } catch (err) {
    return { ok: false, error: `Scaffolder returned non-JSON output: ${(err as Error).message}` }
  }

  const validation = validateArtifact(parsed)
  if (!validation.ok) return { ok: false, error: validation.error }

  // Write the schema file.
  await mkdir(path.dirname(absSchema), { recursive: true })
  await writeFile(absSchema, parsed.fileContents.endsWith('\n') ? parsed.fileContents : parsed.fileContents + '\n')

  // Append the barrel export. Idempotent — skipped if it's already there.
  const indexPath = path.join(root, 'lib/db/index.ts')
  let indexBody = ''
  try {
    indexBody = await readFile(indexPath, 'utf8')
  } catch {
    return {
      ok: true,
      schemaPath,
      pluralKey: parsed.exportName,
      touched: [schemaPath],
      warnings: ['lib/db/index.ts not found — schema export not registered.'],
    }
  }

  const exportLine = `export * from './schema/${spec.slug}'`
  const touched = [schemaPath]
  if (!indexBody.includes(exportLine)) {
    const lines    = indexBody.split('\n')
    const lastIdx  = findLastSchemaExport(lines)
    if (lastIdx >= 0) {
      lines.splice(lastIdx + 1, 0, exportLine)
    } else {
      lines.unshift(exportLine)
    }
    await writeFile(indexPath, lines.join('\n'))
    touched.push('lib/db/index.ts')
  }

  return {
    ok: true,
    schemaPath,
    pluralKey: parsed.exportName,
    touched,
    warnings: [],
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function validateArtifact(a: SchemaArtifact): { ok: true } | { ok: false; error: string } {
  if (!a.fileContents || a.fileContents.length < 50) return { ok: false, error: 'Generated schema is empty.' }
  if (a.fileContents.includes("from 'drizzle-orm/pg-core'")) return { ok: false, error: 'Schema imports from drizzle-orm/pg-core (Postgres) — refusing to write.' }
  if (/\bpgTable\b|\bserial\b|\bvarchar\b/.test(a.fileContents)) return { ok: false, error: 'Schema contains Postgres-only constructs.' }
  if (!a.fileContents.includes('drizzle-orm/sqlite-core')) return { ok: false, error: 'Schema does not import from drizzle-orm/sqlite-core.' }
  if (!a.fileContents.includes('sqliteTable')) return { ok: false, error: 'Schema does not call sqliteTable.' }
  if (!/^[a-z][a-z0-9_]{0,59}$/.test(a.tableName)) return { ok: false, error: `Invalid table name: ${a.tableName}` }
  if (!/^[a-z][a-zA-Z0-9]{0,59}$/.test(a.exportName)) return { ok: false, error: `Invalid export name: ${a.exportName}` }
  return { ok: true }
}

function findLastSchemaExport(lines: string[]): number {
  let last = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^export \* from '\.\/schema\/[^']+'$/.test(lines[i]!.trim())) last = i
  }
  return last
}
