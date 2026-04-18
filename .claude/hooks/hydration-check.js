#!/usr/bin/env node
/**
 * Stop hook: scan files modified in this session under app/ and components/
 * for common Next.js App Router hydration pitfalls. Reports via systemMessage,
 * never blocks. Windows-safe (pure Node, no shell).
 */
const { execSync } = require('node:child_process')
const { readFileSync, existsSync } = require('node:fs')
const path = require('node:path')

function sh(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return ''
  }
}

// Drain stdin so the hook runtime doesn't hang, but we don't need its contents.
try { readFileSync(0, 'utf8') } catch {}

const tracked = sh('git diff --name-only HEAD')
const untracked = sh('git ls-files --others --exclude-standard')
const files = [...tracked.split('\n'), ...untracked.split('\n')]
  .map((f) => f.trim())
  .filter(Boolean)
  .filter((f) => /^(app|components)\//.test(f))
  .filter((f) => !/^app\/api\//.test(f))   // server handlers, not render
  .filter((f) => /\.(tsx|jsx)$/.test(f))   // render files only
  .filter((f) => existsSync(f))

if (files.length === 0) process.exit(0)

const HOOK_RE = /\b(useState|useEffect|useLayoutEffect|useRef|useContext|useReducer|useMemo|useCallback|useTransition|useSyncExternalStore|useDeferredValue|useId|useOptimistic|useFormState|useFormStatus|useParams|useRouter|usePathname|useSearchParams|useAbility)\s*\(/
const CLIENT_API_RE = /\b(window|document|localStorage|sessionStorage|navigator)\./
const NONDETERMINISTIC_RE = /\b(Date\.now\(\)|new Date\(\)|Math\.random\(\))/

const findings = []

for (const file of files) {
  let src
  try { src = readFileSync(file, 'utf8') } catch { continue }

  const lines = src.split('\n')
  const hasUseClient = /^\s*['"]use client['"]/m.test(src.split('\n').slice(0, 5).join('\n'))
  const usesHooks = HOOK_RE.test(src)

  // 1. Missing 'use client' while using hooks
  if (usesHooks && !hasUseClient) {
    const m = src.match(HOOK_RE)
    const lineNo = src.slice(0, src.indexOf(m[0])).split('\n').length
    findings.push({
      file, line: lineNo,
      kind: "missing 'use client'",
      detail: `uses ${m[1]} but no 'use client' directive at top`,
    })
  }

  // 2/3. Scan each line for client-only APIs and non-deterministic calls
  //     outside useEffect/useLayoutEffect/event handlers. Cheap heuristic:
  //     flag occurrences NOT inside a function body that starts with useEffect(
  //     or an on*Handler / onClick= arrow. We approximate by ignoring any line
  //     whose nearest preceding `useEffect(` / `useLayoutEffect(` is still open.
  let effectDepth = 0
  let braceBalance = 0
  let inEffect = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue

    if (/\b(useEffect|useLayoutEffect)\s*\(/.test(line)) {
      inEffect = true
      effectDepth = 0
    }
    if (inEffect) {
      for (const ch of line) {
        if (ch === '{') effectDepth++
        else if (ch === '}') {
          effectDepth--
          if (effectDepth <= 0) { inEffect = false; effectDepth = 0; break }
        }
      }
    }

    if (inEffect) continue
    // Skip handler bodies — rough: lines inside an on*={ arrow that opens & closes later.
    // We skip this for simplicity and accept some noise.

    if (CLIENT_API_RE.test(line) && !/typeof\s+(window|document|localStorage|sessionStorage|navigator)/.test(line)) {
      const m = line.match(CLIENT_API_RE)
      findings.push({
        file, line: i + 1,
        kind: 'client-only API at render',
        detail: `${m[1]} referenced outside useEffect — guard with \`typeof ${m[1]} !== 'undefined'\` or move into useEffect`,
      })
    }
    if (NONDETERMINISTIC_RE.test(line)) {
      const m = line.match(NONDETERMINISTIC_RE)
      findings.push({
        file, line: i + 1,
        kind: 'non-deterministic at render',
        detail: `${m[1]} in render body — will mismatch on hydration; move into useEffect or compute on server`,
      })
    }
  }
}

if (findings.length === 0) process.exit(0)

// Deduplicate by (file, line, kind)
const seen = new Set()
const unique = findings.filter((f) => {
  const k = `${f.file}:${f.line}:${f.kind}`
  if (seen.has(k)) return false
  seen.add(k)
  return true
})

const MAX = 20
const shown = unique.slice(0, MAX)
const lines = [
  `Hydration check: ${unique.length} potential issue${unique.length === 1 ? '' : 's'} across ${new Set(shown.map((f) => f.file)).size} file${new Set(shown.map((f) => f.file)).size === 1 ? '' : 's'}.`,
  ...shown.map((f) => `  • ${f.file}:${f.line} — ${f.kind}: ${f.detail}`),
]
if (unique.length > MAX) lines.push(`  … and ${unique.length - MAX} more`)

process.stdout.write(JSON.stringify({ systemMessage: lines.join('\n') }))
process.exit(0)
