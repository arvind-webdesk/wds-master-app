import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'
import { CronSyncForm } from '@/components/cron-sync/cron-sync-form'

export const metadata = { title: 'New schedule' }

export default async function NewCronSyncPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const ability = defineAbilityFor(user)
  if (!ability.can('create', 'SyncSchedule')) redirect('/cron-sync')

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
        <h1 className="text-xl font-semibold text-foreground">New schedule</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Create a new recurring sync schedule.
        </p>
      </div>
      <CronSyncForm mode="create" />
    </div>
  )
}
