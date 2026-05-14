import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { and, inArray, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { scopeDocuments } from '@/lib/db/schema/scope-documents'
import type Anthropic from '@anthropic-ai/sdk'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'

/**
 * Read uploaded scope documents from disk and turn them into Anthropic content
 * blocks — PDFs become document blocks (Claude reads them natively), text/markdown
 * inline as text, images become image blocks, DOCX/DOC are extracted with mammoth,
 * XLS/XLSX with SheetJS, PPT/PPTX as a best-effort placeholder. Returned in the
 * order of the supplied IDs.
 */

const PDF_MIME = 'application/pdf'
const TEXT_MIMES = new Set(['text/plain', 'text/markdown'])
const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const DOCX_MIMES = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])
const XLSX_MIMES = new Set([
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])
const PPTX_MIMES = new Set([
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

    if (DOCX_MIMES.has(row.mimeType)) {
      let text = ''
      try {
        const result = await mammoth.extractRawText({ buffer: bytes })
        text = result.value.trim()
      } catch (err) {
        text = `[Could not extract text from "${row.filename}": ${err instanceof Error ? err.message : String(err)}]`
      }
      out.push({
        filename: row.filename,
        mimeType: row.mimeType,
        block: { type: 'text', text: `--- ${row.filename} ---\n\n${text || '[empty document]'}\n--- end ---` },
      })
      continue
    }

    if (XLSX_MIMES.has(row.mimeType)) {
      let text = ''
      try {
        const workbook = XLSX.read(bytes, { type: 'buffer' })
        const parts: string[] = []
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName]
          if (!sheet) continue
          const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
          if (csv.trim()) parts.push(`[Sheet: ${sheetName}]\n${csv}`)
        }
        text = parts.join('\n\n')
      } catch (err) {
        text = `[Could not extract text from "${row.filename}": ${err instanceof Error ? err.message : String(err)}]`
      }
      out.push({
        filename: row.filename,
        mimeType: row.mimeType,
        block: { type: 'text', text: `--- ${row.filename} ---\n\n${text || '[empty spreadsheet]'}\n--- end ---` },
      })
      continue
    }

    if (PPTX_MIMES.has(row.mimeType)) {
      // PPTX text extraction requires XML parsing of the ZIP internals.
      // For now surface a clear message so the operator knows to convert to PDF.
      out.push({
        filename: row.filename,
        mimeType: row.mimeType,
        block: {
          type: 'text',
          text: `[scope document "${row.filename}" is a PowerPoint file — convert to PDF and re-upload for full content extraction]`,
        },
      })
      continue
    }
  }

  return out
}
