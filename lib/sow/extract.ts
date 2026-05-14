import { getAnthropicClient, SOW_MODEL } from './anthropic-client'
import { loadScopeDocsAsBlocks } from './file-content'
import type Anthropic from '@anthropic-ai/sdk'

/**
 * Read uploaded scope-of-work documents and ask Claude to extract a list of
 * candidate dashboard modules. Uses structured outputs (json_schema format)
 * so the response is guaranteed to validate against ExtractedSpecsSchema.
 *
 * Server-only. Never call from a client component.
 */

export interface ExtractedField {
  /** snake_case identifier — used as the Drizzle column name. */
  name:        string
  /** One of the SQLite-friendly types we support out of the box. */
  type:        'text' | 'integer' | 'real' | 'boolean' | 'datetime' | 'json'
  required:    boolean
  description: string
}

export interface ExtractedModuleSpec {
  /** kebab-case key, used for routes/CASL/files (e.g. "support-tickets"). */
  slug:        string
  /** Human-readable label for the sidebar (e.g. "Support Tickets"). */
  displayName: string
  /** One-paragraph summary of what this module is for. */
  description: string
  /** Initial schema fields. id/createdAt/updatedAt/deletedAt are added automatically by the scaffolder. */
  fields:      ExtractedField[]
  /** Why this module was extracted from the SOW (one sentence). */
  rationale:   string
}

export interface ExtractResult {
  modules:    ExtractedModuleSpec[]
  /** Free-text overview of the project as Claude understood it from the docs. */
  projectSummary: string
  /** Aspects of the SOW that didn't map cleanly to a module — for staff awareness. */
  unmappedNotes:  string[]
}

const SYSTEM_PROMPT = `You read project Scope of Work documents and extract the
list of distinct dashboard modules the team needs to build.

Each "module" is a coherent feature with its own database table, list/detail
UI, and CRUD operations — for example: "Support Tickets", "Inventory Items",
"Vendor Invoices", "Service Requests". Generic primitives like "Users",
"Roles", "Settings", "Activity Logs", "API Logs", "Email Templates",
"Dashboard", "Connections", "Sync History", "Cron Sync" are ALREADY built into
the platform — never propose those.

Rules:
- slug: kebab-case, plural, 3–40 chars, [a-z0-9-] only.
- displayName: Title Case, plural, what would appear in the sidebar.
- description: 1–2 sentences, plain English, what the module is FOR.
- fields: 3–12 columns per module. Names in snake_case. Pick the most
  appropriate type. Include a "status" enum-like text column when the SOW
  describes a workflow. Do NOT include id, created_at, updated_at, or
  deleted_at — those are added automatically.
- rationale: one sentence pointing at where in the SOW this module came from.

If the SOW is vague, prefer fewer modules with sharper specs over many
speculative ones. Surface anything ambiguous in unmappedNotes.`

const FIELD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name:        { type: 'string' },
    type:        { type: 'string', enum: ['text', 'integer', 'real', 'boolean', 'datetime', 'json'] },
    required:    { type: 'boolean' },
    description: { type: 'string' },
  },
  required: ['name', 'type', 'required', 'description'],
}

const MODULE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    slug:        { type: 'string' },
    displayName: { type: 'string' },
    description: { type: 'string' },
    fields:      { type: 'array', items: FIELD_SCHEMA },
    rationale:   { type: 'string' },
  },
  required: ['slug', 'displayName', 'description', 'fields', 'rationale'],
}

const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    projectSummary: { type: 'string' },
    modules:        { type: 'array', items: MODULE_SCHEMA },
    unmappedNotes:  { type: 'array', items: { type: 'string' } },
  },
  required: ['projectSummary', 'modules', 'unmappedNotes'],
}

export async function extractModulesFromScope(
  documentIds: number[],
): Promise<ExtractResult> {
  // Mock mode — returns a fixed fixture without touching Anthropic.
  // Enable by setting SOW_MOCK_MODE=1 in .env.local. Useful for UI/UX
  // testing without a key or API spend. The fixture is deliberately
  // generic so it doesn't pretend to reflect the uploaded docs.
  if (isMockMode()) return mockExtractResult(documentIds.length)

  const docBlocks = await loadScopeDocsAsBlocks(documentIds)
  if (docBlocks.length === 0) {
    return {
      projectSummary: '',
      modules:        [],
      unmappedNotes:  ['No scope documents could be read.'],
    }
  }

  const client = getAnthropicClient()

  const userBlocks: Anthropic.ContentBlockParam[] = [
    ...docBlocks.map((d) => d.block),
    {
      type: 'text',
      text:
        'Analyze the attached scope-of-work documents and return the structured ' +
        'list of dashboard modules required, plus a project summary and any ' +
        'unmapped notes. Respond ONLY in the required JSON shape.',
    },
  ]

  const response = await client.messages.create({
    model: SOW_MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userBlocks }],
    output_config: { format: { type: 'json_schema', schema: RESULT_SCHEMA } },
    thinking: { type: 'adaptive' },
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    throw new Error(`SOW extraction returned non-JSON text: ${(err as Error).message}\n--- raw ---\n${text.slice(0, 400)}`)
  }

  return normalizeResult(parsed)
}

function normalizeResult(raw: unknown): ExtractResult {
  if (!raw || typeof raw !== 'object') {
    return { projectSummary: '', modules: [], unmappedNotes: ['Empty response from extractor.'] }
  }
  const r = raw as Record<string, unknown>
  const modules = Array.isArray(r.modules) ? r.modules.map(normalizeModule).filter(Boolean) as ExtractedModuleSpec[] : []
  return {
    projectSummary: typeof r.projectSummary === 'string' ? r.projectSummary : '',
    modules,
    unmappedNotes: Array.isArray(r.unmappedNotes) ? r.unmappedNotes.filter((s): s is string => typeof s === 'string') : [],
  }
}

function normalizeModule(raw: unknown): ExtractedModuleSpec | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const slug = typeof r.slug === 'string' ? r.slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) : ''
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return null
  const displayName = typeof r.displayName === 'string' ? r.displayName.slice(0, 80) : ''
  const description = typeof r.description === 'string' ? r.description.slice(0, 500) : ''
  const rationale   = typeof r.rationale   === 'string' ? r.rationale.slice(0, 300)   : ''
  const fields = Array.isArray(r.fields) ? r.fields.map(normalizeField).filter(Boolean) as ExtractedField[] : []
  if (!displayName || !description || fields.length === 0) return null
  return { slug, displayName, description, fields, rationale }
}

function normalizeField(raw: unknown): ExtractedField | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const name = typeof r.name === 'string' ? r.name.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) : ''
  if (!/^[a-z][a-z0-9_]{0,59}$/.test(name)) return null
  if (RESERVED_COLUMNS.has(name)) return null
  const type = r.type as ExtractedField['type']
  if (!['text', 'integer', 'real', 'boolean', 'datetime', 'json'].includes(type)) return null
  return {
    name,
    type,
    required:    Boolean(r.required),
    description: typeof r.description === 'string' ? r.description.slice(0, 300) : '',
  }
}

/** Auto-added by the scaffolder; rejecting these keeps Claude from duplicating them. */
const RESERVED_COLUMNS = new Set(['id', 'created_at', 'updated_at', 'deleted_at'])

// ─── Mock mode ──────────────────────────────────────────────────────────────

/** Truthy when SOW_MOCK_MODE is set in env. Lets devs click through the wizard without an API key. */
export function isMockMode(): boolean {
  const flag = process.env.SOW_MOCK_MODE?.trim().toLowerCase() ?? ''
  return flag === '1' || flag === 'true' || flag === 'yes'
}

function mockExtractResult(docCount: number): ExtractResult {
  return {
    projectSummary:
      `[MOCK] No Anthropic call was made. Set SOW_MOCK_MODE=0 (or remove the env var) ` +
      `and add ANTHROPIC_API_KEY to .env.local for a real extraction. ` +
      `${docCount} document${docCount === 1 ? '' : 's'} would have been analyzed.`,
    modules: [
      {
        slug:        'support-tickets',
        displayName: 'Support Tickets',
        description: 'Customer-facing tickets with status, priority, and assignment.',
        rationale:   '[MOCK] Fixture module — does not reflect uploaded docs.',
        fields: [
          { name: 'subject',      type: 'text',     required: true,  description: 'Short headline of the issue' },
          { name: 'body',         type: 'text',     required: true,  description: 'Full description' },
          { name: 'status',       type: 'text',     required: true,  description: 'open | in_progress | resolved | closed' },
          { name: 'priority',     type: 'text',     required: false, description: 'low | medium | high | urgent' },
          { name: 'requester_id', type: 'integer',  required: true,  description: 'FK to users' },
          { name: 'assignee_id',  type: 'integer',  required: false, description: 'FK to users (staff)' },
          { name: 'due_date',     type: 'datetime', required: false, description: 'When the ticket should be resolved' },
        ],
      },
      {
        slug:        'vendor-invoices',
        displayName: 'Vendor Invoices',
        description: 'Inbound invoices from vendors awaiting approval and payment.',
        rationale:   '[MOCK] Fixture module — does not reflect uploaded docs.',
        fields: [
          { name: 'invoice_number', type: 'text',    required: true,  description: 'Vendor-issued invoice number' },
          { name: 'vendor_name',    type: 'text',    required: true,  description: 'Vendor / payee name' },
          { name: 'amount',         type: 'real',    required: true,  description: 'Invoice total' },
          { name: 'currency',       type: 'text',    required: true,  description: 'ISO 4217 code' },
          { name: 'status',         type: 'text',    required: true,  description: 'received | approved | paid | rejected' },
          { name: 'due_date',       type: 'datetime', required: false, description: 'Payment due date' },
          { name: 'paid_at',        type: 'datetime', required: false, description: 'When paid (null while open)' },
        ],
      },
    ],
    unmappedNotes: [
      '[MOCK] Mock mode is enabled. Disable with SOW_MOCK_MODE=0 to extract from your real SOW.',
    ],
  }
}
