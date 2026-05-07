/**
 * Shopify sync — GraphQL Admin API 2026-04.
 *
 * Shopify removed the REST Admin API for new apps, so all sync runs go through
 * the GraphQL endpoint at /admin/api/{version}/graphql.json. Each target
 * (products / orders / customers) uses cursor pagination via `pageInfo`.
 *
 * Queries in this file have been validated against the live schema via the
 * shopify-dev-mcp `validate_graphql_codeblocks` tool before landing.
 *
 * Auth: X-Shopify-Access-Token header from the encrypted connection credentials
 * (see app/api/connections/shopify/callback/route.ts).
 *
 * Note on orders: Shopify limits the default `orders` connection to the last
 * 60 days. Stores that need older history must have the `read_all_orders`
 * scope granted — the app's OAuth scope list controls this.
 */

import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  integrationProducts,
  integrationOrders,
  integrationCustomers,
} from '@/lib/db/schema/integrations'

const API_VERSION = '2026-04'
const PAGE_SIZE   = 100

export interface ShopifySyncArgs {
  connectionId: number
  shop:         string // *.myshopify.com
  accessToken:  string
  onProgress:   (seen: number, upserted: number) => Promise<void>
  signal?:      AbortSignal
}

type SyncResult = { seen: number; upserted: number }

interface GqlResponse<T> {
  data?:   T
  errors?: Array<{ message: string }>
}

async function gql<T>(
  shop: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type':           'application/json',
      'Accept':                 'application/json',
    },
    body:   JSON.stringify({ query, variables }),
    signal,
  })
  if (!res.ok) {
    const snippet = await res.text().catch(() => '')
    throw new Error(`Shopify GraphQL HTTP ${res.status}: ${snippet.slice(0, 200)}`)
  }
  const body = (await res.json()) as GqlResponse<T>
  if (body.errors && body.errors.length > 0) {
    throw new Error(`Shopify GraphQL errors: ${body.errors.map((e) => e.message).join('; ')}`)
  }
  if (!body.data) {
    throw new Error('Shopify GraphQL response missing data')
  }
  return body.data
}

// ─── Shop currency (fetched once per run) ───────────────────────────────────

const SHOP_QUERY = /* GraphQL */ `
  query SyncShop { shop { currencyCode } }
`

async function getShopCurrency(shop: string, accessToken: string, signal?: AbortSignal): Promise<string> {
  try {
    const data = await gql<{ shop: { currencyCode: string } }>(shop, accessToken, SHOP_QUERY, {}, signal)
    return data.shop?.currencyCode ?? 'USD'
  } catch {
    return 'USD'
  }
}

// ─── Products ───────────────────────────────────────────────────────────────

const PRODUCTS_QUERY = /* GraphQL */ `
  query SyncProducts($after: String) {
    products(first: ${PAGE_SIZE}, after: $after) {
      edges {
        cursor
        node {
          id
          title
          status
          variants(first: 1) {
            edges { node { sku price } }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`

interface ProductNode {
  id:       string
  title:    string | null
  status:   string | null   // ACTIVE | ARCHIVED | DRAFT
  variants: { edges: Array<{ node: { sku: string | null; price: string | null } }> }
}

export async function syncShopifyProducts(args: ShopifySyncArgs): Promise<SyncResult> {
  const { connectionId, shop, accessToken, onProgress, signal } = args
  const currency = await getShopCurrency(shop, accessToken, signal)

  let seen = 0
  let upserted = 0
  let after: string | null = null
  let hasNext = true

  type ProductsPage = {
    products: {
      edges:    Array<{ cursor: string; node: ProductNode }>
      pageInfo: { hasNextPage: boolean; endCursor: string | null }
    }
  }
  while (hasNext) {
    const data: ProductsPage = await gql<ProductsPage>(shop, accessToken, PRODUCTS_QUERY, { after }, signal)

    const edges = data.products.edges
    seen += edges.length

    for (const { node: p } of edges) {
      const first = p.variants?.edges[0]?.node ?? { sku: null, price: null }
      const values = {
        platform:     'shopify' as const,
        connectionId,
        externalId:   p.id,
        title:    p.title ?? null,
        sku:      first.sku  ?? null,
        price:    first.price ?? null,
        currency,
        status:   p.status ? p.status.toLowerCase() : null, // normalize ACTIVE → active
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
    hasNext = data.products.pageInfo.hasNextPage
    after   = data.products.pageInfo.endCursor
  }

  return { seen, upserted }
}

// ─── Orders ─────────────────────────────────────────────────────────────────

const ORDERS_QUERY = /* GraphQL */ `
  query SyncOrders($after: String) {
    orders(first: ${PAGE_SIZE}, after: $after) {
      edges {
        cursor
        node {
          id
          name
          email
          createdAt
          displayFinancialStatus
          totalPriceSet { shopMoney { amount currencyCode } }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`

interface OrderNode {
  id:                     string
  name:                   string | null
  email:                  string | null
  createdAt:              string | null
  displayFinancialStatus: string | null
  totalPriceSet:          { shopMoney: { amount: string | null; currencyCode: string | null } } | null
}

export async function syncShopifyOrders(args: ShopifySyncArgs): Promise<SyncResult> {
  const { connectionId, shop, accessToken, onProgress, signal } = args

  let seen = 0
  let upserted = 0
  let after: string | null = null
  let hasNext = true

  type OrdersPage = {
    orders: {
      edges:    Array<{ cursor: string; node: OrderNode }>
      pageInfo: { hasNextPage: boolean; endCursor: string | null }
    }
  }
  while (hasNext) {
    const data: OrdersPage = await gql<OrdersPage>(shop, accessToken, ORDERS_QUERY, { after }, signal)

    const edges = data.orders.edges
    seen += edges.length

    for (const { node: o } of edges) {
      const money = o.totalPriceSet?.shopMoney
      const values = {
        platform:      'shopify' as const,
        connectionId,
        externalId:    o.id,
        orderNumber:   o.name ?? null,
        customerEmail: o.email ?? null,
        totalPrice:    money?.amount       ?? null,
        currency:      money?.currencyCode ?? null,
        status:        o.displayFinancialStatus ? o.displayFinancialStatus.toLowerCase() : null,
        placedAt:      o.createdAt ?? null,
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
    hasNext = data.orders.pageInfo.hasNextPage
    after   = data.orders.pageInfo.endCursor
  }

  return { seen, upserted }
}

// ─── Customers ──────────────────────────────────────────────────────────────

const CUSTOMERS_QUERY = /* GraphQL */ `
  query SyncCustomers($after: String) {
    customers(first: ${PAGE_SIZE}, after: $after) {
      edges {
        cursor
        node {
          id
          firstName
          lastName
          defaultEmailAddress { emailAddress }
          numberOfOrders
          amountSpent { amount currencyCode }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`

interface CustomerNode {
  id:                  string
  firstName:           string | null
  lastName:            string | null
  defaultEmailAddress: { emailAddress: string | null } | null
  numberOfOrders:      string | null // returned as string (!)
  amountSpent:         { amount: string | null; currencyCode: string | null } | null
}

export async function syncShopifyCustomers(args: ShopifySyncArgs): Promise<SyncResult> {
  const { connectionId, shop, accessToken, onProgress, signal } = args

  let seen = 0
  let upserted = 0
  let after: string | null = null
  let hasNext = true

  type CustomersPage = {
    customers: {
      edges:    Array<{ cursor: string; node: CustomerNode }>
      pageInfo: { hasNextPage: boolean; endCursor: string | null }
    }
  }
  while (hasNext) {
    const data: CustomersPage = await gql<CustomersPage>(shop, accessToken, CUSTOMERS_QUERY, { after }, signal)

    const edges = data.customers.edges
    seen += edges.length

    for (const { node: c } of edges) {
      const ordersCountNum = c.numberOfOrders != null ? Number(c.numberOfOrders) : null
      const values = {
        platform:    'shopify' as const,
        connectionId,
        externalId:  c.id,
        email:       c.defaultEmailAddress?.emailAddress ?? null,
        firstName:   c.firstName ?? null,
        lastName:    c.lastName  ?? null,
        ordersCount: Number.isFinite(ordersCountNum) ? (ordersCountNum as number) : null,
        totalSpent:  c.amountSpent?.amount ?? null,
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
    hasNext = data.customers.pageInfo.hasNextPage
    after   = data.customers.pageInfo.endCursor
  }

  return { seen, upserted }
}
