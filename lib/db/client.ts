import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './index'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
})

export const db = drizzle(pool, { schema })
