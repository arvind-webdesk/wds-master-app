import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { connections } from '@/lib/db/schema/connections'
import { getSession } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'
import { encryptJson } from '@/lib/crypto/encryption'

export const dynamic = 'force-dynamic'

const SHOP_REGEX = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i

/**
 * GET /api/connections/shopify/callback
 * Handles Shopify OAuth callback:
 *  1. Verify session + state + shop + HMAC.
 *  2. Exchange code for access_token.
 *  3. Upsert connection row.
 *  4. Clear transient session state.
 *  5. 302 to /connections/[id]?connected=1.
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  const user = session.user
  if (!user) {
    return NextResponse.json(
      { error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } },
      { status: 401 },
    )
  }

  const ability = defineAbilityFor(user)
  if (!ability.can('create', 'Connection')) {
    return NextResponse.json(
      { error: { message: 'Forbidden', code: 'FORBIDDEN' } },
      { status: 403 },
    )
  }

  const pending = session.shopifyOAuth
  if (!pending) {
    return NextResponse.json(
      { error: { message: 'No OAuth flow in progress', code: 'VALIDATION_ERROR' } },
      { status: 400 },
    )
  }

  const { searchParams } = new URL(req.url)
  const code  = searchParams.get('code')
  const shop  = (searchParams.get('shop') ?? '').trim().toLowerCase()
  const state = searchParams.get('state')
  const hmac  = searchParams.get('hmac')

  if (!code || !shop || !state || !hmac) {
    return NextResponse.json(
      { error: { message: 'Missing required callback params', code: 'VALIDATION_ERROR' } },
      { status: 400 },
    )
  }

  if (state !== pending.state || shop !== pending.shop || !SHOP_REGEX.test(shop)) {
    // Clear session regardless to avoid stuck state.
    session.shopifyOAuth = undefined
    await session.save()
    return NextResponse.json(
      { error: { message: 'OAuth state/shop mismatch', code: 'VALIDATION_ERROR' } },
      { status: 400 },
    )
  }

  const clientId     = process.env.SHOPIFY_CLIENT_ID
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        error: {
          message: 'Shopify OAuth is not configured. Set SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET.',
          code: 'INTERNAL_ERROR',
        },
      },
      { status: 500 },
    )
  }

  // HMAC verification — build message from query params excluding `hmac` itself,
  // sorted alphabetically, joined as k=v with &.
  const params = Array.from(searchParams.entries())
    .filter(([k]) => k !== 'hmac' && k !== 'signature')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  const expectedHmac = createHmac('sha256', clientSecret).update(params).digest('hex')
  const actualBuf    = Buffer.from(hmac, 'hex')
  const expectedBuf  = Buffer.from(expectedHmac, 'hex')
  const hmacOk       = actualBuf.length === expectedBuf.length && timingSafeEqual(actualBuf, expectedBuf)
  if (!hmacOk) {
    session.shopifyOAuth = undefined
    await session.save()
    return NextResponse.json(
      { error: { message: 'OAuth HMAC mismatch', code: 'VALIDATION_ERROR' } },
      { status: 400 },
    )
  }

  // Exchange code for access token.
  let tokenResp: { access_token?: string; scope?: string }
  try {
    const resp = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    })
    if (!resp.ok) {
      throw new Error(`Token exchange failed: HTTP ${resp.status}`)
    }
    tokenResp = (await resp.json()) as { access_token?: string; scope?: string }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[shopify/callback] token exchange failed', msg)
    return NextResponse.json(
      { error: { message: 'Failed to exchange authorization code', code: 'INTERNAL_ERROR' } },
      { status: 500 },
    )
  }

  const accessToken = tokenResp.access_token
  const scope       = tokenResp.scope ?? ''
  if (!accessToken) {
    return NextResponse.json(
      { error: { message: 'Shopify did not return an access token', code: 'INTERNAL_ERROR' } },
      { status: 500 },
    )
  }

  const encrypted = encryptJson({
    accessToken,
    scope,
    installedAt: new Date().toISOString(),
  })

  // Upsert on (type='shopify', storeIdentifier=shop).
  const existing = await db
    .select()
    .from(connections)
    .where(
      and(
        eq(connections.type, 'shopify'),
        eq(connections.storeIdentifier, shop),
        isNull(connections.deletedAt),
      ),
    )
    .limit(1)

  let rowId: number
  if (existing.length > 0) {
    const [row] = existing
    await db
      .update(connections)
      .set({
        credentials: encrypted,
        status:      'active',
        updatedAt:   new Date().toISOString(),
      })
      .where(eq(connections.id, row.id))
    rowId = row.id
  } else {
    const [row] = await db
      .insert(connections)
      .values({
        name:            shop,
        type:            'shopify',
        status:          'active',
        storeIdentifier: shop,
        credentials:     encrypted,
        createdBy:       user.id,
      })
      .returning()
    rowId = row.id
  }

  // Clear transient session state.
  const returnTo = pending.returnTo || '/connections'
  session.shopifyOAuth = undefined
  await session.save()

  const appUrl = (process.env.APP_URL ?? new URL(req.url).origin).replace(/\/$/, '')
  const target = returnTo.startsWith('/') ? `${appUrl}${returnTo}` : returnTo
  const finalUrl = `${target}${target.includes('?') ? '&' : '?'}connected=1&connectionId=${rowId}`
  return NextResponse.redirect(finalUrl, { status: 302 })
}
