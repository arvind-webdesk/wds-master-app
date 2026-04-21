'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, CheckCircle, XCircle, Clock } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

// ─── Types ───────────────────────────────────────────────────────────────────

type JobStatus = 'queued' | 'running' | 'ok' | 'failed'

interface SyncJob {
  id: number
  connectionId: number
  target: string
  status: JobStatus
  progress: number
  recordsSeen: number
  recordsUpserted: number
  error: string | null
  startedAt: string
  finishedAt: string | null
}

interface Props {
  open: boolean
  jobId: number | null
  onClose: () => void
}

// ─── Status chip ─────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: JobStatus }) {
  if (status === 'queued') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
        <Clock className="h-3 w-3" />
        Queued
      </span>
    )
  }
  if (status === 'running') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 dark:bg-sky-950/30">
        <Loader2 className="h-3 w-3 animate-spin" />
        Running
      </span>
    )
  }
  if (status === 'ok') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/30">
        <CheckCircle className="h-3 w-3" />
        Completed
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
      <XCircle className="h-3 w-3" />
      Failed
    </span>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export function RunProgressModal({ open, jobId, onClose }: Props) {
  const [job, setJob] = useState<SyncJob | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const toastedRef = useRef(false)

  function stopPolling() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  useEffect(() => {
    if (!open || jobId === null) {
      setJob(null)
      toastedRef.current = false
      stopPolling()
      return
    }

    toastedRef.current = false

    async function poll() {
      try {
        const res = await fetch(`/api/sync-jobs/${jobId}`)
        if (!res.ok) return
        const json = await res.json()
        const j: SyncJob = json.data
        setJob(j)

        if (j.status === 'ok' || j.status === 'failed') {
          stopPolling()
          if (!toastedRef.current) {
            toastedRef.current = true
            if (j.status === 'ok') {
              toast.success(`Sync completed — ${j.recordsUpserted} records upserted`)
            } else {
              toast.error(`Sync failed: ${j.error ?? 'Unknown error'}`)
            }
          }
        }
      } catch {
        // network error — keep polling
      }
    }

    poll()
    intervalRef.current = setInterval(poll, 1000)
    return () => stopPolling()
  }, [open, jobId])

  const isTerminal = job?.status === 'ok' || job?.status === 'failed'
  const progress = job?.progress ?? 0

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Sync in progress</DialogTitle>
          <DialogDescription>
            Live progress for job #{jobId ?? '—'}.{' '}
            {!isTerminal && (
              <span className="text-muted-foreground">
                Closing this dialog will not cancel the background job.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Status chip */}
          <div className="flex items-center justify-between">
            <StatusChip status={job?.status ?? 'queued'} />
            <span className="text-xs text-muted-foreground tabular-nums">{progress}%</span>
          </div>

          {/* Progress bar */}
          <Progress value={progress} />

          {/* Counters */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[0.625rem] border border-border bg-muted/40 p-3 text-center">
              <p className="text-xs text-muted-foreground">Records seen</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
                {(job?.recordsSeen ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="rounded-[0.625rem] border border-border bg-muted/40 p-3 text-center">
              <p className="text-xs text-muted-foreground">Records upserted</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
                {(job?.recordsUpserted ?? 0).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Error detail */}
          {job?.status === 'failed' && job.error && (
            <div className="rounded-[0.625rem] border border-destructive/30 bg-destructive/5 p-3">
              <p className="mb-1 text-xs font-medium text-destructive">Error</p>
              <code className="block whitespace-pre-wrap break-all font-mono text-xs text-muted-foreground">
                {job.error}
              </code>
            </div>
          )}
        </div>

        <DialogFooter>
          {isTerminal && job && (
            <Link
              href={`/sync-history?target=${job.target}`}
              onClick={onClose}
              className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-input bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              View in Sync History
            </Link>
          )}
          <Button variant={isTerminal ? 'default' : 'outline'} size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
