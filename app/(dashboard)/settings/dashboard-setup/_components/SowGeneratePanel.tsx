'use client'

import { useEffect, useState, useTransition } from 'react'
import { Sparkles, Loader2, AlertCircle, CheckCircle2, FileText, Database, Wand2, FlaskConical } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { extractModulesFromSow, getSowMode, scaffoldModuleFromSpec } from '../sow-actions'
import type { ExtractedModuleSpec, ExtractResult } from '@/lib/sow/extract'
import type { ScopeDocumentDraft } from './ScopeUploader'

/**
 * Step 4 sub-panel: extract candidate modules from the uploaded SOW with
 * Claude, let the operator pick which to scaffold, and write the Drizzle
 * schema files. API routes + UI scaffolding aren't generated here yet — the
 * existing scaffold-module skill handles those, run after migration.
 */

interface SowGeneratePanelProps {
  docs:     ReadonlyArray<ScopeDocumentDraft>
  disabled: boolean
}

interface SpecRow {
  spec:    ExtractedModuleSpec
  status:  'idle' | 'scaffolding' | 'done' | 'failed'
  message?: string
  schemaPath?: string
}

export function SowGeneratePanel({ docs, disabled }: SowGeneratePanelProps) {
  const [extracting, startExtract] = useTransition()
  const [scaffoldingPending, startScaffold] = useTransition()
  const [extracted, setExtracted] = useState<ExtractResult | null>(null)
  const [rows, setRows] = useState<SpecRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [overwrite, setOverwrite] = useState(false)
  const [mockMode, setMockMode] = useState(false)

  useEffect(() => {
    let cancelled = false
    getSowMode().then((m) => { if (!cancelled) setMockMode(m.mock) }).catch(() => { /* ignore */ })
    return () => { cancelled = true }
  }, [])

  function handleExtract() {
    if (docs.length === 0) {
      toast.error('Upload at least one scope document first.')
      return
    }
    setError(null)
    startExtract(async () => {
      const result = await extractModulesFromSow(docs.map((d) => d.id))
      if (!result.ok || !result.result) {
        setError(result.error ?? 'Extraction failed.')
        toast.error(result.error ?? 'Extraction failed.')
        return
      }
      setExtracted(result.result)
      setRows(result.result.modules.map((spec) => ({ spec, status: 'idle' })))
      toast.success(`Found ${result.result.modules.length} candidate module${result.result.modules.length === 1 ? '' : 's'}.`)
    })
  }

  function handleScaffoldOne(idx: number) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, status: 'scaffolding' as const, message: undefined } : r)))
    startScaffold(async () => {
      const target = rows[idx]
      if (!target) return
      const result = await scaffoldModuleFromSpec(target.spec, { overwrite })
      setRows((prev) => prev.map((r, i) => {
        if (i !== idx) return r
        if (!result.ok) return { ...r, status: 'failed' as const, message: result.error ?? result.outcome?.error ?? 'Failed.' }
        return {
          ...r,
          status: 'done' as const,
          message: result.outcome?.warnings?.length ? result.outcome.warnings.join('; ') : 'Schema written.',
          schemaPath: result.outcome?.schemaPath,
        }
      }))
      if (result.ok) toast.success(`Scaffolded ${target.spec.displayName}.`)
      else toast.error(result.error ?? 'Scaffolding failed.')
    })
  }

  return (
    <div className="rounded-md border border-dashed border-border bg-muted/30 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 text-primary shrink-0" />
          <div>
            <div className="text-sm font-semibold">Generate modules from your SOW</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Reads the uploaded scope documents with Claude and proposes new dashboard modules.
              Schema files write to <code className="font-mono text-[11px] bg-muted px-1 rounded">lib/db/schema/</code>.
              Run <code className="font-mono text-[11px] bg-muted px-1 rounded">pnpm drizzle-kit migrate</code> after — it&apos;s not auto-applied.
            </p>
          </div>
        </div>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] whitespace-nowrap text-primary">Phase 1: schema only</span>
      </div>

      {mockMode ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
          <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <div className="font-semibold">Mock mode is on — no Anthropic call will be made.</div>
            <p className="mt-0.5">
              Extraction returns a fixed fixture so you can click through the wizard without a key.
              Remove <code className="font-mono bg-amber-500/10 px-1 rounded">SOW_MOCK_MODE</code> from <code className="font-mono bg-amber-500/10 px-1 rounded">.env.local</code> and restart the dev server to extract from your real SOW.
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={handleExtract}
          disabled={disabled || extracting || docs.length === 0}
        >
          {extracting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />}
          {extracting ? 'Reading scope…' : 'Extract modules from SOW'}
        </Button>
        <span className="text-xs text-muted-foreground">
          {docs.length === 0 ? 'No documents uploaded.' : `${docs.length} document${docs.length === 1 ? '' : 's'} ready.`}
        </span>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}

      {extracted ? (
        <div className="space-y-4">
          {extracted.projectSummary ? (
            <div className="rounded-md border border-border bg-background p-3 text-xs leading-relaxed text-muted-foreground">
              <div className="font-semibold text-foreground mb-1">Project summary</div>
              {extracted.projectSummary}
            </div>
          ) : null}

          {extracted.unmappedNotes.length > 0 ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              <div className="font-semibold text-amber-700 dark:text-amber-400 mb-1">Unmapped notes</div>
              <ul className="list-disc list-inside space-y-0.5 text-amber-700 dark:text-amber-400">
                {extracted.unmappedNotes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">{rows.length} candidate module{rows.length === 1 ? '' : 's'}</span>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} className="h-3.5 w-3.5" />
              Overwrite existing schema files
            </label>
          </div>

          <div className="space-y-2">
            {rows.map((row, idx) => (
              <SpecCard
                key={row.spec.slug}
                row={row}
                disabled={disabled || scaffoldingPending}
                onScaffold={() => handleScaffoldOne(idx)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function SpecCard({
  row, disabled, onScaffold,
}: {
  row: SpecRow
  disabled: boolean
  onScaffold: () => void
}) {
  const { spec, status, message, schemaPath } = row
  return (
    <div className={cn(
      'rounded-md border bg-background p-3',
      status === 'done'   && 'border-emerald-500/40',
      status === 'failed' && 'border-destructive/40',
      status === 'idle'   && 'border-border',
      status === 'scaffolding' && 'border-primary/40',
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Database className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-semibold">{spec.displayName}</span>
            <code className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{spec.slug}</code>
            <span className="text-[10px] text-muted-foreground">{spec.fields.length} fields</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{spec.description}</p>
          {spec.rationale ? (
            <p className="text-[11px] text-muted-foreground italic mt-1">From SOW: {spec.rationale}</p>
          ) : null}

          <details className="mt-2">
            <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">Show fields</summary>
            <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
              {spec.fields.map((f) => (
                <li key={f.name} className="text-[11px] text-muted-foreground">
                  <code className="font-mono text-foreground">{f.name}</code>
                  <span className="text-muted-foreground"> · {f.type}</span>
                  {f.required ? <span className="text-destructive"> *</span> : null}
                  {f.description ? <span className="text-muted-foreground"> — {f.description}</span> : null}
                </li>
              ))}
            </ul>
          </details>

          {message ? (
            <div className={cn(
              'mt-2 text-[11px] flex items-start gap-1.5',
              status === 'done'   && 'text-emerald-600 dark:text-emerald-400',
              status === 'failed' && 'text-destructive',
            )}>
              {status === 'done'   && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
              {status === 'failed' && <AlertCircle  className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
              <div>
                <div>{message}</div>
                {schemaPath ? <code className="font-mono text-[10px] block">{schemaPath}</code> : null}
              </div>
            </div>
          ) : null}
        </div>

        <Button
          type="button"
          size="sm"
          variant={status === 'done' ? 'outline' : 'default'}
          onClick={onScaffold}
          disabled={disabled || status === 'scaffolding'}
          className="shrink-0"
        >
          {status === 'scaffolding' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {status === 'idle'        && <Wand2  className="mr-1.5 h-3.5 w-3.5" />}
          {status === 'done'        ? 'Re-scaffold' : status === 'scaffolding' ? 'Working…' : 'Scaffold schema'}
        </Button>
      </div>
    </div>
  )
}
