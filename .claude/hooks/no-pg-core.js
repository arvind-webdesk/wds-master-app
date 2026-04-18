#!/usr/bin/env node
/**
 * PreToolUse hook — blocks Postgres imports.
 * This project uses SQLite via @libsql/client + drizzle-orm/sqlite-core.
 */

let raw = ''
process.stdin.on('data', (c) => (raw += c))
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(raw)
    const input   = payload.tool_input ?? {}
    const content = input.content ?? input.new_string ?? ''
    const path    = input.file_path ?? ''

    // Never block the hooks/templates/agents themselves — they may reference these patterns as examples
    if (path.includes('.claude/')) process.exit(0)

    const PATTERNS = [
      /from\s+['"]drizzle-orm\/pg-core['"]/,
      /from\s+['"]drizzle-orm\/node-postgres['"]/,
      /from\s+['"]pg['"]/,
      /require\(['"]pg['"]\)/,
      /new\s+Pool\s*\(/,
      /import\s+\{\s*Pool\s*\}\s+from\s+['"]pg['"]/,
    ]

    for (const re of PATTERNS) {
      if (re.test(content)) {
        process.stderr.write(
          '[no-pg-core] Postgres client detected in ' + (path || 'this write') + '.\n' +
          'This project uses SQLite via @libsql/client. Use:\n' +
          "  - Schemas: `import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core'`\n" +
          "  - Client:  `import { drizzle } from 'drizzle-orm/libsql'`\n" +
          'See lib/db/schema/ and lib/db/client.ts for examples.\n',
        )
        process.exit(2) // block
      }
    }
    process.exit(0)
  } catch {
    // If stdin isn't valid JSON, don't block — let the write proceed
    process.exit(0)
  }
})
