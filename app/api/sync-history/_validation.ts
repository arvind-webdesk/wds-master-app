import { z } from 'zod'

export const listQuerySchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().refine((v) => [10, 20, 50, 100].includes(v), {
    message: 'limit must be one of 10, 20, 50, 100',
  }).default(20),

  sort: z
    .enum(['startedAt', 'finishedAt', 'durationMs', 'recordsSeen', 'recordsUpserted'])
    .default('startedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),

  platform:     z.enum(['shopify', 'bigcommerce']).optional(),
  target:       z.enum(['products', 'orders', 'customers']).optional(),
  status:       z.enum(['running', 'ok', 'failed']).optional(),
  connectionId: z.coerce.number().int().min(1).optional(),
  triggeredBy:  z.coerce.number().int().min(1).optional(),

  dateFrom: z.string().optional(),
  dateTo:   z.string().optional(),

  q: z.string().max(200).optional(),
})

export type ListQuery = z.infer<typeof listQuerySchema>

export const idParamSchema = z.coerce.number().int().positive()
