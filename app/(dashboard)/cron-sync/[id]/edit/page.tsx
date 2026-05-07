'use client'

import { useEffect, useState } from 'react'
import { useParams, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useAbility } from '@/lib/acl/ability-context'
import { CronSyncForm } from '@/components/cron-sync/cron-sync-form'
import type { SyncScheduleRow } from '@/components/cron-sync/cron-sync-columns'

export default function EditCronSyncPage() {
  const params  = useParams<{ id: string }>()
  const ability = useAbility()
  const canUpdate = ability.can('update', 'SyncSchedule')
  const id = params.id

  const [schedule, setSchedule]   = useState<SyncScheduleRow | null>(null)
  const [loading,  setLoading]    = useState(true)
  const [missing,  setMissing]    = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    fetch(`/api/cron-sync/${id}`)
      .then(async (res) => {
        if (res.status === 404) { setMissing(true); return }
        const json = await res.json()
        if (res.ok) setSchedule(json.data ?? null)
      })
      .finally(() => setLoading(false))
  }, [id])

  if (missing) notFound()

  return (
    <div className="flex flex-col gap-4 p-6">
      <Link
        href="/cron-sync"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to schedules
      </Link>
      <div>
        <h1 className="text-xl font-semibold text-foreground">Edit schedule</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Update the schedule configuration.
        </p>
      </div>

      {!canUpdate ? (
        <div className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          You do not have permission to edit schedules.
        </div>
      ) : loading || !schedule ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <CronSyncForm mode="edit" schedule={schedule} />
      )}
    </div>
  )
}
