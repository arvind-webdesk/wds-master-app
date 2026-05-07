import { NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { scopeDocuments } from '@/lib/db/schema/scope-documents'
import { getSessionUser } from '@/lib/auth/session'

/**
 * Stream an uploaded scope document back to the staff member who is allowed
 * to view OnboardingConfig. The stored_path is server-controlled (set in
 * upload-action.ts) so we don't need to sanitize it again — but we still
 * `path.resolve()` against the project root and refuse anything outside.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  if (user.userType !== 'superadmin') {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const { id: idParam } = await params
  const id = Number(idParam)
  if (!Number.isInteger(id) || id <= 0) return new NextResponse('Bad request', { status: 400 })

  const [row] = await db
    .select()
    .from(scopeDocuments)
    .where(and(eq(scopeDocuments.id, id), isNull(scopeDocuments.deletedAt)))
    .limit(1)
  if (!row) return new NextResponse('Not found', { status: 404 })

  const root    = path.resolve(process.cwd())
  const abs     = path.resolve(root, row.storedPath)
  if (!abs.startsWith(root + path.sep) && abs !== root) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  let bytes: Buffer
  try {
    bytes = await readFile(abs)
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }

  // Convert Node Buffer → fresh ArrayBuffer slice (avoids SharedArrayBuffer typing in NextResponse).
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

  return new NextResponse(ab, {
    status: 200,
    headers: {
      'Content-Type':        row.mimeType || 'application/octet-stream',
      'Content-Length':      String(row.sizeBytes),
      'Content-Disposition': `attachment; filename="${row.filename.replace(/"/g, '')}"`,
      'Cache-Control':       'private, no-store',
    },
  })
}
