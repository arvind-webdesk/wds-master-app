import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { scopeDocuments } from '@/lib/db/schema/scope-documents'
import type Anthropic from '@anthropic-ai/sdk'

/**
 * Read uploaded scope documents from disk and turn them into Anthropic content
 * blocks — PDFs become document blocks (Claude reads them natively), text files
 * inline as text content, images become image blocks. Office docs (DOC/DOCX/
 * XLS/XLSX/PPT/PPTX) currently surface as a placeholder text note — when we
 * add a parser library we'll inline their text instead. Returned in the order
 * of the supplied IDs.
 */

const PDF_MIME = 'application/pdf'
const TEXT_MIMES = new Set(['text/plain', 'text/markdown'])
const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const OFFICE_MIMES = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

export interface DocBlock {
  filename: string
  mimeType: string
  /** Anthropic content block built from the file. */
  block:    Anthropic.ContentBlockParam
}

export async function loadScopeDocsAsBlocks(ids: number[]): Promise<DocBlock[]> {
  if (ids.length === 0) return []

  const rows = await db
    .select()
    .from(scopeDocuments)
    .where(and(inArray(scopeDocuments.id, ids), isNull(scopeDocuments.deletedAt)))

  // Preserve caller-supplied order
  const byId = new Map(rows.map((r) => [r.id, r]))
  const out: DocBlock[] = []

  const root = path.resolve(process.cwd())

  for (const id of ids) {
    const row = byId.get(id)
    if (!row) continue

    const abs = path.resolve(root, row.storedPath)
    if (!abs.startsWith(root + path.sep) && abs !== root) continue

    let bytes: Buffer
    try {
      bytes = await readFile(abs)
    } catch {
      continue
    }

    if (row.mimeType === PDF_MIME) {
      out.push({
        filename: row.filename,
        mimeType: row.mimeType,
        block: {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: bytes.toString('base64') },
          title:  row.filename,
        },
      })
      continue
    }

    if (TEXT_MIMES.has(row.mimeType)) {
      const text = bytes.toString('utf8')
      out.push({
        filename: row.filename,
        mimeType: row.mimeType,
        block: { type: 'text', text: `--- ${row.filename} ---\n\n${text}\n--- end ---` },
      })
      continue
    }

    if (IMAGE_MIMES.has(row.mimeType)) {
      out.push({
        filename: row.filename,
        mimeType: row.mimeType,
        block: {
          type: 'image',
          source: {
            type: 'base64',
            media_type: row.mimeType as 'image/png' | 'image/jpeg' | 'image/webp',
            data: bytes.toString('base64'),
          },
        },
      })
      continue
    }

    if (OFFICE_MIMES.has(row.mimeType)) {
      // TODO: extract text via mammoth/xlsx/pptx parsers. For now surface a
      // placeholder so the model knows there's content it can't see.
      out.push({
        filename: row.filename,
        mimeType: row.mimeType,
        block: {
          type: 'text',
          text: `[scope document "${row.filename}" (${row.mimeType}) — text extraction for Office formats is not yet wired up; please re-upload as PDF for content access]`,
        },
      })
      continue
    }
  }

  return out
}
