#!/usr/bin/env node
/**
 * PreToolUse hook — protects .env files, dev.db, and blocks hard-coded secrets.
 */

let raw = ''
process.stdin.on('data', (c) => (raw += c))
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(raw)
    const input   = payload.tool_input ?? {}
    const content = input.content ?? input.new_string ?? ''
    const path    = (input.file_path ?? '').replace(/\\/g, '/')

    // --- Block writes to protected paths ---
    // Match both absolute and bare paths (e.g. ".env" or "/path/to/.env")
    const PROTECTED_PATHS = [
      /(^|\/)\.env$/,
      /(^|\/)\.env\.local$/,
      /(^|\/)\.env\.production$/,
      /(^|\/)\.env\.development\.local$/,
      /(^|\/)dev\.db$/,
      /(^|\/)dev\.db-(shm|wal|journal)$/,
    ]
    for (const re of PROTECTED_PATHS) {
      if (re.test(path)) {
        process.stderr.write(
          '[protect-secrets] ' + path + ' is off-limits.\n' +
          'Secrets live in .env / .env.local (gitignored). The dev.db file is managed by drizzle-kit\n' +
          'and the seed script. If you need to edit env vars, update .env.example — never the live env file.\n',
        )
        process.exit(2)
      }
    }

    // Allow the .claude/ folder (docs may quote secret patterns as examples)
    if (path.includes('.claude/')) process.exit(0)

    // --- Block hard-coded secrets in content ---
    const SECRET_PATTERNS = [
      { name: 'GitHub PAT',         re: /\bghp_[A-Za-z0-9]{36}\b/ },
      { name: 'GitHub token',       re: /\bghs_[A-Za-z0-9]{36}\b/ },
      { name: 'x-access-token URL', re: /https:\/\/x-access-token:/ },
      { name: 'Bearer token',       re: /Authorization:\s*Bearer\s+[A-Za-z0-9._\-]{24,}/i },
      { name: 'PEM private key',    re: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/ },
      { name: 'bcrypt hash',        re: /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/ },
      { name: 'Postgres URL w/ pwd', re: /postgres(ql)?:\/\/[^:/\s]+:[^@/\s]{8,}@/ },
      { name: 'AWS access key',     re: /\bAKIA[0-9A-Z]{16}\b/ },
      { name: 'Stripe live key',    re: /\bsk_live_[A-Za-z0-9]{24,}/ },
    ]
    for (const { name, re } of SECRET_PATTERNS) {
      if (re.test(content)) {
        process.stderr.write(
          '[protect-secrets] Hard-coded ' + name + ' detected in ' + (path || 'this write') + '.\n' +
          'Do not commit secrets to source. Put the real value in .env.local (gitignored) and\n' +
          'reference it via process.env.YOUR_KEY. Add a placeholder to .env.example for onboarding.\n',
        )
        process.exit(2)
      }
    }

    process.exit(0)
  } catch {
    process.exit(0)
  }
})
