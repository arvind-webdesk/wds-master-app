/**
 * BigCommerce sync — paginates the REST v3 (catalog, customers) and v2
 * (orders) APIs and upserts into integration_products / integration_orders /
 * integration_customers.
 *
 * Auth: X-Auth-Token header with the token persisted during the connection
 * create flow (see app/api/connections/route.ts).
 */

import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  integrationProducts,
  integrationOrders,
  integrationCustomers,
} from '@/lib/db/schema/integrations'

const PAGE_SIZE = 250

export interface BigCommerceSyncArgs {
  connectionId: number
  storeHash:    string
  accessToken:  string
  onProgress:   (seen: number, upserted: number) => Promise<void>
  signal?:      AbortSignal
}

type SyncResult = { seen: number; upserted: number }

function headers(accessToken: string): HeadersInit {
  return {
    'X-Auth-Token': accessToken,
    'Content-Type': 'application/json',
    'Accept':       'application/json',
  }
}

async function bcFetch<T>(url: string, accessToken: string, signal?: AbortSignal): Promise<{ status: number; body: T | null }> {
  const res = await fetch(url, { headers: headers(accessToken), signal })
  // BigCommerce v2 returns 204 to signal "no more pages" — handle as empty.
  if (res.status === 204) return { status: 204, body: null }
  if (!res.ok) {
    const snippet = await res.text().catch(() => '')
    throw new Error(`BigCommerce ${url}: HTTP ${res.status} ${snippet.slice(0, 200)}`)
  }
  const body = (await res.json()) as T
  return { status: res.status, body }
}

// ─── Products (v3) ──────────────────────────────────────────────────────────

export async function syncBigCommerceProducts(args: BigCommerceSyncArgs): Promise<SyncResult> {
  const { connectionId, storeHash, accessToken, onProgress, signal } = args

  let seen = 0
  let upserted = 0
  let page = 1
  let totalPages = 1

  do {
    const url = `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products?page=${page}&limit=${PAGE_SIZE}&include_fields=name,sku,price,is_visible`
    const { body } = await bcFetch<{
      data: Array<Record<string, unknown>>
      meta?: { pagination?: { total_pages?: number } }
    }>(url, accessToken, signal)
    if (!body) break

    const rows = body.data ?? []
    totalPages = body.meta?.pagination?.total_pages ?? page
    seen += rows.length

    for (const p of rows) {
      const externalId = String(p.id)
      const values = {
        platform:     'bigcommerce' as const,
        connectionId,
        externalId,
        title:    p.name    ? String(p.name)    : null,
        sku:      p.sku     ? String(p.sku)     : null,
        price:    p.price != null ? String(p.price) : null,
        // BC product-level currency isn't exposed here — v2 /store gives default currency.
        currency: null,
        status:   p.is_visible === false ? 'archived' : 'active',
        raw:      JSON.stringify(p),
      }

      await db
        .insert(integrationProducts)
        .values(values)
        .onConflictDoUpdate({
          target: [integrationProducts.connectionId, integrationProducts.externalId],
          set: {
            title:    values.title,
            sku:      values.sku,
            price:    values.price,
            currency: values.currency,
            status:   values.status,
            raw:      values.raw,
            syncedAt: sql`(CURRENT_TIMESTAMP)`,
          },
        })
      upserted++
    }

    await onProgress(seen, upserted)
    page++
  } while (page <= totalPages)

  return { seen, upserted }
}

// ─── Orders (v2) ────────────────────────────────────────────────────────────

const BC_ORDER_STATUS: Record<number, string> = {
  0:  'incomplete',
  1:  'pending',
  2:  'shipped',
  3:  'partially-shipped',
  4:  'refunded',
  5:  'cancelled',
  6:  'declined',
  7:  'awaiting-payment',
  8:  'awaiting-pickup',
  9:  'awaiting-shipment',
  10: 'completed',
  11: 'awaiting-fulfillment',
  12: 'manual-verification-required',
  13: 'disputed',
  14: 'partially-refunded',
}

export async function syncBigCommerceOrders(args: BigCommerceSyncArgs): Promise<SyncResult> {
  const { connectionId, storeHash, accessToken, onProgress, signal } = args

  let seen = 0
  let upserted = 0
  let page = 1

  while (true) {
    const url = `https://api.bigcommerce.com/stores/${storeHash}/v2/orders?page=${page}&limit=${PAGE_SIZE}`
    const { status, body } = await bcFetch<Array<Record<string, unknown>>>(url, accessToken, signal)
    if (status === 204 || !body || body.length === 0) break

    seen += body.length

    for (const o of body) {
      const externalId = String(o.id)
      const statusIdRaw = o.status_id
      const statusKey   = typeof statusIdRaw === 'number' ? statusIdRaw : Number(statusIdRaw)
      const statusLabel = BC_ORDER_STATUS[statusKey] ?? (o.status ? String(o.status) : null)

      const values = {
        platform:      'bigcommerce' as const,
        connectionId,
        externalId,
        orderNumber:   String(o.id),
        customerEmail: o.billing_address && typeof o.billing_address === 'object'
          ? String((o.billing_address as Record<string, unknown>).email ?? '') || null
          : null,
        totalPrice:    o.total_inc_tax != null ? String(o.total_inc_tax) : null,
        currency:      o.currency_code ? String(o.currency_code) : null,
        status:        statusLabel,
        placedAt:      o.date_created ? new Date(String(o.date_created)).toISOString() : null,
        raw:           JSON.stringify(o),
      }

      await db
        .insert(integrationOrders)
        .values(values)
        .onConflictDoUpdate({
          target: [integrationOrders.connectionId, integrationOrders.externalId],
          set: {
            orderNumber:   values.orderNumber,
            customerEmail: values.customerEmail,
            totalPrice:    values.totalPrice,
            currency:      values.currency,
            status:        values.status,
            placedAt:      values.placedAt,
            raw:           values.raw,
            syncedAt:      sql`(CURRENT_TIMESTAMP)`,
          },
        })
      upserted++
    }

    await onProgress(seen, upserted)
    page++
  }

  return { seen, upserted }
}

// ─── Customers (v3) ─────────────────────────────────────────────────────────

export async function syncBigCommerceCustomers(args: BigCommerceSyncArgs): Promise<SyncResult> {
  const { connectionId, storeHash, accessToken, onProgress, signal } = args

  let seen = 0
  let upserted = 0
  let page = 1
  let totalPages = 1

  do {
    const url = `https://api.bigcommerce.com/stores/${storeHash}/v3/customers?page=${page}&limit=${PAGE_SIZE}&include_fields=email,first_name,last_name`
    const { body } = await bcFetch<{
      data: Array<Record<string, unknown>>
      meta?: { pagination?: { total_pages?: number } }
    }>(url, accessToken, signal)
    if (!body) break

    const rows = body.data ?? []
    totalPages = body.meta?.pagination?.total_pages ?? page
    seen += rows.length

    for (const c of rows) {
      const externalId = String(c.id)
      const values = {
        platform:    'bigcommerce' as const,
        connectionId,
        externalId,
        email:       c.email        ? String(c.email)        : null,
        firstName:   c.first_name   ? String(c.first_name)   : null,
        lastName:    c.last_name    ? String(c.last_name)    : null,
        // BC v3 /customers does not return order aggregates — leave nullable.
        ordersCount: null,
        totalSpent:  null,
        raw:         JSON.stringify(c),
      }

      await db
        .insert(integrationCustomers)
        .values(values)
        .onConflictDoUpdate({
          target: [integrationCustomers.connectionId, integrationCustomers.externalId],
          set: {
            email:       values.email,
            firstName:   values.firstName,
            lastName:    values.lastName,
            ordersCount: values.ordersCount,
            totalSpent:  values.totalSpent,
            raw:         values.raw,
            syncedAt:    sql`(CURRENT_TIMESTAMP)`,
          },
        })
      upserted++
    }

    await onProgress(seen, upserted)
    page++
  } while (page <= totalPages)

  return { seen, upserted }
}
