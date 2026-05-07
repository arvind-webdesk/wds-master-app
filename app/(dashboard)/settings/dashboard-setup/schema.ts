import { z } from 'zod'
import { ONBOARDING_MODULE_KEYS } from '@/lib/onboarding/modules'

const emptyToUndef = (v: unknown) => (v === '' ? undefined : v)

const optionalString  = z.preprocess(emptyToUndef, z.string().max(255).optional())
const optionalUrl     = z.preprocess(emptyToUndef, z.string().url('Enter a full URL including https://').optional())
const optionalPublicAssetUrl = z.preprocess(
  emptyToUndef,
  z
    .string()
    .refine(
      (v) => v.startsWith('/') || z.string().url().safeParse(v).success,
      'Enter a full URL or a public asset path starting with /.',
    )
    .optional(),
)
const optionalHexColor = z.preprocess(emptyToUndef, z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a valid hex color.').optional())

export const setupSchema = z
  .object({
    // Step 1 — dashboard type
    dashboardType: z.enum(['standalone', 'custom', 'middleware', 'saas']),

    // Step 2 — client info & configuration (incl. branding + integrations)
    name:     z.string().trim().min(1, 'Client name is required.').max(100),
    slug:     z
      .string()
      .trim()
      .min(3, 'Slug must be at least 3 characters.')
      .max(40, 'Slug must be 40 characters or fewer.')
      .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers, and hyphens.'),
    industry: optionalString,
    country:  optionalString,
    timezone: z.string().min(1, 'Pick a timezone.'),

    brandPrimaryColor:   z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a brand color.'),
    brandSecondaryColor: optionalHexColor,
    brandFontFamily:     z.preprocess(emptyToUndef, z.string().max(100).optional()),
    brandLogoUrl:        optionalPublicAssetUrl,
    brandFaviconUrl:     optionalPublicAssetUrl,
    sidebarTheme:        z.enum(['light', 'navy', 'zoho', 'slate', 'neutral']),

    integrations: z.object({
      shopify: z.object({
        enabled:  z.boolean(),
        storeUrl: z.preprocess(
          emptyToUndef,
          z.string().regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i, 'Enter the .myshopify.com domain.').optional(),
        ),
        sync: z.object({
          products:  z.boolean(),
          orders:    z.boolean(),
          customers: z.boolean(),
        }),
      }),
      bigcommerce: z.object({
        enabled:   z.boolean(),
        storeHash: z.preprocess(
          emptyToUndef,
          z.string().regex(/^[a-z0-9]{6,16}$/i, 'Store hash is 6–16 alphanumeric characters.').optional(),
        ),
        connection: z.object({
          name:         z.preprocess(emptyToUndef, z.string().max(120).optional()),
          accessToken:  z.preprocess(emptyToUndef, z.string().max(500).optional()),
          clientId:     z.preprocess(emptyToUndef, z.string().max(200).optional()),
          clientSecret: z.preprocess(emptyToUndef, z.string().max(500).optional()),
        }),
        sync: z.object({
          products:  z.boolean(),
          orders:    z.boolean(),
          customers: z.boolean(),
        }),
      }),
    }),

    // Step 3 — scope & project planning
    planningNotes:    z.preprocess(emptyToUndef, z.string().max(2000, 'Notes too long (max 2000 chars).').optional()),
    /** ids of scope_documents rows already uploaded via the upload-action. */
    scopeDocumentIds: z.array(z.number().int().positive()).default([]),

    // Step 4 — modules
    enabledModules: z.array(z.string().min(1)).min(1, 'Pick at least one module.'),

    // Free-form internal notes (kept on client_config)
    notes: z.preprocess(emptyToUndef, z.string().max(1000, 'Notes too long (max 1000 chars).').optional()),
  })
  .superRefine((val, ctx) => {
    if (val.dashboardType === 'saas') {
      ctx.addIssue({
        code: 'custom',
        path: ['dashboardType'],
        message: 'SaaS is coming soon. Pick another option.',
      })
    }
    // Custom + Middleware require at least one platform; Standalone/SaaS skip integrations.
    const needsPlatform = val.dashboardType === 'custom' || val.dashboardType === 'middleware'
    if (needsPlatform) {
      const anyEnabled = val.integrations.shopify.enabled || val.integrations.bigcommerce.enabled
      if (!anyEnabled) {
        ctx.addIssue({
          code: 'custom',
          path: ['integrations'],
          message: 'Pick at least one platform for this dashboard type.',
        })
      }
    }
    if (val.integrations.bigcommerce.enabled) {
      const conn = val.integrations.bigcommerce.connection
      const hasConnectionInput = Boolean(conn.name || conn.accessToken || conn.clientId || conn.clientSecret)
      if (hasConnectionInput) {
        if (!val.integrations.bigcommerce.storeHash) {
          ctx.addIssue({
            code: 'custom',
            path: ['integrations', 'bigcommerce', 'storeHash'],
            message: 'Store hash is required to create a BigCommerce connection.',
          })
        }
        if (!conn.accessToken || conn.accessToken.length < 10) {
          ctx.addIssue({
            code: 'custom',
            path: ['integrations', 'bigcommerce', 'connection', 'accessToken'],
            message: 'Access token required (min 10 chars).',
          })
        }
        if (!conn.clientId) {
          ctx.addIssue({
            code: 'custom',
            path: ['integrations', 'bigcommerce', 'connection', 'clientId'],
            message: 'Client ID is required.',
          })
        }
      }
    }
    for (const k of val.enabledModules) {
      if (!ONBOARDING_MODULE_KEYS.has(k)) {
        ctx.addIssue({
          code: 'custom',
          path: ['enabledModules'],
          message: `Unknown module: ${k}`,
        })
      }
    }
  })

// Note: explicit type rather than `z.infer<typeof setupSchema>` because tsc
// runs out of heap inferring the Zod schema's nested arrays + preprocess
// chain combined with react-hook-form's Resolver type.
export interface SetupFormValues {
  dashboardType: 'standalone' | 'custom' | 'middleware' | 'saas'

  name:                string
  slug:                string
  industry?:           string
  country?:            string
  timezone:            string

  brandPrimaryColor:   string
  brandSecondaryColor?: string
  brandFontFamily?:    string
  brandLogoUrl?:       string
  brandFaviconUrl?:    string
  sidebarTheme:        'light' | 'navy' | 'zoho' | 'slate' | 'neutral'

  integrations: {
    shopify: {
      enabled:  boolean
      storeUrl?: string
      sync: { products: boolean; orders: boolean; customers: boolean }
    }
    bigcommerce: {
      enabled:   boolean
      storeHash?: string
      connection: {
        name?:         string
        accessToken?:  string
        clientId?:     string
        clientSecret?: string
      }
      sync: { products: boolean; orders: boolean; customers: boolean }
    }
  }

  planningNotes?:    string
  scopeDocumentIds:  number[]

  enabledModules: string[]
  notes?:         string
}
