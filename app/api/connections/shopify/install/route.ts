import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { getSession } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'

export const dynamic = 'force-dynamic'

const SHOP_REGEX = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i

/**
 * GET /api/connections/shopify/install?shop=<domain>
 * Starts the Shopify OAuth install flow.
 * 1. Validate session + CASL create:Connection.
 * 2. Validate shop param.
 * 3. Generate random `state`, persist in iron-session under `shopifyOAuth`.
 * 4. 302 to Shopify /admin/oauth/authorize.
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

  const { searchParams } = new URL(req.url)
  const shop = (searchParams.get('shop') ?? '').trim().toLowerCase()
  if (!shop || !SHOP_REGEX.test(shop)) {
    return NextResponse.json(
      { error: { message: 'Invalid shop domain — must be *.myshopify.com', code: 'VALIDATION_ERROR' } },
      { status: 422 },
    )
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID
  const scopes   = process.env.SHOPIFY_SCOPES ?? 'read_products,read_orders,read_customers'
  const appUrl   = process.env.APP_URL
  if (!clientId || !appUrl) {
    return NextResponse.json(
      {
        error: {
          message: 'Shopify OAuth is not configured. Set SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, and APP_URL.',
          code: 'INTERNAL_ERROR',
        },
      },
      { status: 500 },
    )
  }

  const state = randomBytes(32).toString('base64url')
  session.shopifyOAuth = {
    state,
    shop,
    returnTo:  searchParams.get('returnTo') ?? '/connections',
    startedAt: new Date().toISOString(),
  }
  await session.save()

  const redirectUri = `${appUrl.replace(/\/$/, '')}/api/connections/shopify/callback`
  const authorizeUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`

  return NextResponse.redirect(authorizeUrl, { status: 302 })
}
