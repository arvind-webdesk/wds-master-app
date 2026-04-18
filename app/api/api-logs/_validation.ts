import { z } from 'zod'

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'] as const

const STATUS_BUCKETS = ['1xx', '2xx', '3xx', '4xx', '5xx'] as const

export const listQuerySchema = z
  .object({
    page:        z.coerce.number().int().min(1).default(1),
    limit:       z.coerce.number().int().refine((v) => [10, 20, 50, 100].includes(v), {
      message: 'limit must be one of 10, 20, 50, 100',
    }).default(20),
    sort:        z.enum(['createdAt', 'responseStatus', 'durationMs']).default('createdAt'),
    order:       z.enum(['asc', 'desc']).default('desc'),
    method:      z
      .string()
      .transform((v) => v.toUpperCase())
      .pipe(z.enum(HTTP_METHODS))
      .optional(),
    status:      z
      .string()
      .optional()
      .transform((v) => {
        if (v === undefined) return undefined
        // Bucket token
        if ((STATUS_BUCKETS as readonly string[]).includes(v)) return v
        // Exact numeric
        const n = Number(v)
        if (Number.isInteger(n) && n >= 100 && n <= 599) return String(n)
        return v
      })
      .pipe(
        z
          .string()
          .optional()
          .refine(
            (v) => {
              if (v === undefined) return true
              if ((STATUS_BUCKETS as readonly string[]).includes(v)) return true
              const n = Number(v)
              return Number.isInteger(n) && n >= 100 && n <= 599
            },
            { message: 'status must be 100–599 or one of 1xx, 2xx, 3xx, 4xx, 5xx' },
          ),
      ),
    errorOnly:   z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    from:        z.string().datetime({ offset: true }).optional().or(z.string().date().optional()),
    to:          z.string().datetime({ offset: true }).optional().or(z.string().date().optional()),
    q:           z.string().min(1).max(200).optional(),
    logType:     z.string().min(1).max(64).optional(),
    environment: z.string().min(1).max(32).optional(),
  })
  .refine(
    (d) => {
      if (d.from && d.to) return d.from <= d.to
      return true
    },
    { message: 'from must not be later than to', path: ['from'] },
  )

export const idParamSchema = z.coerce.number().int().positive()
