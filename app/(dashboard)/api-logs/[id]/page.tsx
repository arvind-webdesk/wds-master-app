import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ScrollText } from 'lucide-react'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'
import { ApiLogDetailPanel } from '@/components/api-logs/ApiLogDetailPanel'

interface ApiLogDetailPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string }>
}

export default async function ApiLogDetailPage({
  params,
  searchParams,
}: ApiLogDetailPageProps) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const user = await getSessionUser()
  if (!user) redirect('/login')

  // ── ACL ─────────────────────────────────────────────────────────────────────
  const ability = defineAbilityFor(user)
  if (!ability.can('read', 'ApiLog')) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 p-6">
        <ScrollText className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          You don't have permission to view API logs.
        </p>
      </div>
    )
  }

  // ── Resolve params ──────────────────────────────────────────────────────────
  const { id: idRaw } = await params
  const id = parseInt(idRaw, 10)

  if (!Number.isFinite(id) || id <= 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 p-6">
        <p className="text-sm text-muted-foreground">Invalid log ID.</p>
      </div>
    )
  }

  const { from } = await searchParams
  const backHref = from ?? '/api-logs'

  return (
    <div className="flex flex-col gap-0 max-w-3xl mx-auto p-6">
      {/* Back button */}
      <div className="mb-4">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors -ml-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to API Logs
        </Link>
      </div>

      {/* Detail panel rendered in a page context */}
      <div className="rounded-[0.625rem] border border-border bg-card overflow-hidden">
        <ApiLogDetailPanel logId={id} />
      </div>
    </div>
  )
}
