import { NextRequest, NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { connections } from '@/lib/db/schema/connections'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'
import { decryptJson } from '@/lib/crypto/encryption'

// ─── Credential shapes (inline — lib/crypto/connection-credentials.ts types) ─

interface BigCommerceCredentials {
  storeHash:    string
  accessToken:  string
  clientId:     string
  clientSecret?: string
}

interface ShopifyCredentials {
  accessToken:  string
  scope:        string
  installedAt:  string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function coerceId(raw: string): number | null {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Flip connection status and persist. Does not throw on failure. */
async function setStatus(id: number, status: 'active' | 'error') {
  try {
    await db
      .update(connections)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(eq(connections.id, id))
  } catch {
    // Best-effort — do not surface a secondary write failure.
  }
}

// ─── POST /api/connections/[id]/test ─────────────────────────────────────────

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // 1. Session
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json(
      { error: { message: 'Not authenticated', code: 'UNAUTHORIZED' } },
      { status: 401 },
    )
  }

  // 2. CASL — test is authorized under update
  const ability = defineAbilityFor(user)
  if (!ability.can('update', 'Connection')) {
    return NextResponse.json(
      { error: { message: 'Forbidden', code: 'FORBIDDEN' } },
      { status: 403 },
    )
  }

  // 3. Coerce id
  const { id: rawId } = await params
  const id = coerceId(rawId)
  if (id === null) {
    return NextResponse.json(
      { error: { message: 'Invalid connection id', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  // 4. Load connection
  const [row] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.id, id), isNull(connections.deletedAt)))
    .limit(1)

  if (!row) {
    return NextResponse.json(
      { error: { message: 'Connection not found', code: 'NOT_FOUND' } },
      { status: 404 },
    )
  }

  const checkedAt = new Date().toISOString()

  // 5. Shopify — Phase 2 (OAuth) not yet implemented
  if (row.type === 'shopify') {
    return NextResponse.json(
      { error: { message: 'Shopify connection testing not yet implemented (Phase 2)', code: 'INTERNAL_ERROR' } },
      { status: 501 },
    )
  }

  // 6. BigCommerce health check
  if (row.type === 'bigcommerce') {
    if (!row.credentials) {
      return NextResponse.json({
        data: { ok: false, platform: 'bigcommerce', checkedAt, error: 'No credentials stored for this connection' },
      })
    }

    let creds: BigCommerceCredentials
    try {
      creds = decryptJson<BigCommerceCredentials>(row.credentials)
    } catch {
      await setStatus(id, 'error')
      return NextResponse.json({
        data: { ok: false, platform: 'bigcommerce', checkedAt, error: 'Failed to decrypt credentials' },
      })
    }

    const url = `https://api.bigcommerce.com/stores/${creds.storeHash}/v2/store`

    let response: Response
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10_000)
      try {
        response = await fetch(url, {
          headers: {
            'X-Auth-Token': creds.accessToken,
            'Accept':       'application/json',
          },
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeout)
      }
    } catch (err: unknown) {
      const isTimeout =
        err instanceof Error &&
        (err.name === 'AbortError' || err.message.includes('abort'))
      const summary = isTimeout ? 'network timeout' : 'network error'
      await setStatus(id, 'error')
      return NextResponse.json({
        data: { ok: false, platform: 'bigcommerce', checkedAt, error: summary },
      })
    }

    if (!response.ok) {
      const summary = `HTTP ${response.status}`
      await setStatus(id, 'error')
      return NextResponse.json({
        data: { ok: false, platform: 'bigcommerce', checkedAt, error: summary },
      })
    }

    let storeData: Record<string, unknown>
    try {
      storeData = await response.json() as Record<string, unknown>
    } catch {
      await setStatus(id, 'error')
      return NextResponse.json({
        data: { ok: false, platform: 'bigcommerce', checkedAt, error: 'invalid response' },
      })
    }

    // If connection was previously in error state, flip back to active.
    if (row.status === 'error') {
      await setStatus(id, 'active')
    }

    return NextResponse.json({
      data: {
        ok: true,
        platform: 'bigcommerce',
        checkedAt,
        details: {
          name:               storeData.name,
          domain:             storeData.domain,
          controlPanelBaseUrl: storeData.control_panel_base_url,
        },
      },
    })
  }

  // Unknown type guard
  return NextResponse.json(
    { error: { message: `Unknown connection type: ${row.type}`, code: 'INTERNAL_ERROR' } },
    { status: 500 },
  )
}
