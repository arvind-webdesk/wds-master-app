#!/usr/bin/env node
/**
 * PreToolUse hook — blocks Prisma imports.
 * This project uses Drizzle ORM. See lib/db/schema/ for examples.
 */

let raw = ''
process.stdin.on('data', (c) => (raw += c))
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(raw)
    const input   = payload.tool_input ?? {}
    const content = input.content ?? input.new_string ?? ''
    const path    = input.file_path ?? ''

    if (path.includes('.claude/')) process.exit(0)

    const PATTERNS = [
      /from\s+['"]@prisma\/client['"]/,
      /require\(['"]@prisma\/client['"]\)/,
      /new\s+PrismaClient\s*\(/,
      /import\s+\{\s*PrismaClient\s*\}/,
      /\bprisma\.schema\b/,
    ]

    for (const re of PATTERNS) {
      if (re.test(content)) {
        process.stderr.write(
          '[no-prisma] Prisma detected in ' + (path || 'this write') + '.\n' +
          'This project uses Drizzle ORM with libsql/SQLite. Use:\n' +
          "  - Schemas: drizzle-orm/sqlite-core (see lib/db/schema/)\n" +
          "  - Client:  lib/db/client.ts (drizzle(libsqlClient, { schema }))\n" +
          '  - Queries: import { db } from \'@/lib/db/client\'; db.select().from(...).where(...)\n',
        )
        process.exit(2)
      }
    }
    process.exit(0)
  } catch {
    process.exit(0)
  }
})
