import type { Config } from 'drizzle-kit'

export default {
  schema:  './lib/db/schema/*.ts',
  out:     './drizzle/migrations',
  dialect: 'turso',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'file:./dev.db',
  },
  verbose: true,
  strict:  false,
} satisfies Config
