import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import * as schema from './index'

const url = process.env.DATABASE_URL ?? 'file:./dev.db'

const client = createClient({ url })

export const db = drizzle(client, { schema })
