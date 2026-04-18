'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  CalendarDays,
  Globe,
  Loader2,
  Mail,
  Phone,
  Shield,
  Trash2,
  UserCog,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useAbility } from '@/lib/acl/ability-context'
import { UsersSheet } from '@/components/users/users-sheet'
import type { UserRow } from '@/components/users/users-columns'

// ─── Activity log row type ─────────────────────────────────────────────────────

type ActivityLog = {
  id: number
  action: string
  target: string | null
  ipAddress: string | null
  createdAt: string
}

// ─── Helper: badge variants ───────────────────────────────────────────────────

function userTypeBadgeVariant(t: string) {
  if (t === 'superadmin') return 'default' as const
  if (t === 'admin') return 'secondary' as const
  return 'outline' as const
}

function initials(u: UserRow) {
  return `${u.firstName[0] ?? ''}${u.lastName[0] ?? ''}`.toUpperCase()
}

// ─── Grid row ─────────────────────────────────────────────────────────────────

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm text-foreground mt-0.5 break-all">{value ?? '—'}</p>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UserDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const ability = useAbility()

  const userId = params.id

  // ── Tab ──
  const activeTab = (searchParams.get('tab') ?? 'account') as 'account' | 'activity'

  function setTab(tab: string) {
    const qs = new URLSearchParams(searchParams.toString())
    qs.set('tab', tab)
    router.replace(`/users/${userId}?${qs.toString()}`, { scroll: false })
  }

  // ── User state ──
  const [user, setUser] = useState<UserRow | null>(null)
  const [userLoading, setUserLoading] = useState(true)
  const [notFoundState, setNotFoundState] = useState(false)

  // ── Activity state ──
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [logsTotal, setLogsTotal] = useState(0)
  const [logsPage, setLogsPage] = useState(1)
  const [logsLoading, setLogsLoading] = useState(false)

  // ── Sheet ──
  const [sheetOpen, setSheetOpen] = useState(false)

  // ── Confirm state ──
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmToggle, setConfirmToggle] = useState(false)
  const [actionPending, startAction] = useTransition()

  // ── CASL ──
  const canUpdate = ability.can('update', 'User')
  const canDelete = ability.can('delete', 'User')
  const canActivate = ability.can('activate', 'User')

  // ── Fetch user ──
  const loadUser = useCallback(async () => {
    setUserLoading(true)
    try {
      const res = await fetch(`/api/users/${userId}`)
      if (res.status === 404) {
        setNotFoundState(true)
        return
      }
      const json = await res.json()
      if (res.ok) {
        setUser(json.data)
      } else {
        toast.error(json.error?.message ?? 'Failed to load user')
      }
    } catch {
      toast.error('Network error — could not load user')
    } finally {
      setUserLoading(false)
    }
  }, [userId])

  useEffect(() => {
    loadUser()
  }, [loadUser])

  // ── Fetch activity logs ──
  const loadLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const qs = new URLSearchParams({
        userId: userId,
        page: String(logsPage),
        limit: '20',
      })
      const res = await fetch(`/api/activity-logs?${qs}`)
      const json = await res.json()
      if (res.ok) {
        setLogs(json.data ?? [])
        setLogsTotal(json.meta?.total ?? 0)
      }
    } catch {
      // silently fail — not a critical error
    } finally {
      setLogsLoading(false)
    }
  }, [userId, logsPage])

  useEffect(() => {
    if (activeTab === 'activity') {
      loadLogs()
    }
  }, [activeTab, loadLogs])

  // ── Not found ──
  if (notFoundState) {
    notFound()
  }

  // ── Delete ──
  function executeDelete() {
    if (!user) return
    startAction(async () => {
      const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (res.ok) {
        toast.success(`${user.firstName} ${user.lastName} deleted`)
        router.push('/users')
      } else {
        toast.error(json.error?.message ?? 'Delete failed')
        setConfirmDelete(false)
      }
    })
  }

  // ── Toggle status ──
  function executeToggle() {
    if (!user) return
    const newStatus = user.status === 'active' ? 'inactive' : 'active'
    startAction(async () => {
      const res = await fetch(`/api/users/${user.id}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const json = await res.json()
      if (res.ok) {
        toast.success(
          `${user.firstName} ${user.lastName} ${newStatus === 'active' ? 'activated' : 'deactivated'}`,
        )
        setUser(json.data)
        setConfirmToggle(false)
      } else {
        toast.error(json.error?.message ?? 'Status update failed')
        setConfirmToggle(false)
      }
    })
  }

  // ── Loading skeleton ──
  if (userLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-5 w-24" />
        <Card className="rounded-[0.625rem] border-border shadow-none">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div className="flex flex-col gap-2 flex-1">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-64" />
                <div className="flex gap-2 mt-1">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!user) return null

  const isSelf = false // server enforces; we can't know current user id client-only
  const canToggle = canActivate && !isSelf
  const canDel = canDelete && !isSelf

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Back nav */}
      <button
        onClick={() => router.push('/users')}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to users
      </button>

      {/* Header card */}
      <Card className="rounded-[0.625rem] border-border shadow-none">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            {/* Avatar */}
            <Avatar size="lg" className="h-16 w-16 text-base">
              {user.image && <AvatarImage src={user.image} alt={`${user.firstName} ${user.lastName}`} />}
              <AvatarFallback className="text-base">{initials(user)}</AvatarFallback>
            </Avatar>

            {/* Name + meta */}
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold text-foreground">
                {user.firstName} {user.lastName}
              </h1>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {/* Status badge */}
                {user.status === 'active' ? (
                  <Badge
                    variant="secondary"
                    className="bg-green-500/10 text-green-700 border-green-500/20 dark:text-green-400"
                  >
                    Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Inactive
                  </Badge>
                )}
                {/* User type */}
                <Badge variant={userTypeBadgeVariant(user.userType)}>
                  {user.userType.charAt(0).toUpperCase() + user.userType.slice(1)}
                </Badge>
                {/* Role */}
                {user.role && (
                  <Badge variant="outline">{user.role.name}</Badge>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {canUpdate && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSheetOpen(true)}
                >
                  <UserCog className="h-4 w-4 mr-1.5" />
                  Edit
                </Button>
              )}
              {canToggle && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmToggle(true)}
                >
                  {user.status === 'active' ? 'Deactivate' : 'Activate'}
                </Button>
              )}
              {canDel && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Delete
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        {/* Account tab */}
        <TabsContent value="account">
          <Card className="rounded-[0.625rem] border-border shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Profile details
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6 divide-y divide-border">
              <InfoRow
                icon={Mail}
                label="Email"
                value={user.email}
              />
              <InfoRow
                icon={Phone}
                label="Contact number"
                value={user.contactNo ?? '—'}
              />
              <InfoRow
                icon={Shield}
                label="Role"
                value={user.role?.name ?? '—'}
              />
              <InfoRow
                icon={UserCog}
                label="User type"
                value={
                  <span className="capitalize">{user.userType}</span>
                }
              />
              <InfoRow
                icon={Globe}
                label="Portal"
                value={user.portal ?? '—'}
              />
              <InfoRow
                icon={CalendarDays}
                label="Created"
                value={new Date(user.createdAt).toLocaleString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              />
              <InfoRow
                icon={CalendarDays}
                label="Last updated"
                value={new Date(user.updatedAt).toLocaleString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity tab */}
        <TabsContent value="activity">
          <Card className="rounded-[0.625rem] border-border shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Activity log
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {logsLoading ? (
                <div className="flex flex-col divide-y divide-border">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-start gap-3 px-6 py-3">
                      <Skeleton className="h-4 w-28 shrink-0" />
                      <Skeleton className="h-4 flex-1" />
                    </div>
                  ))}
                </div>
              ) : logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                  <p className="text-sm text-muted-foreground">
                    No activity recorded for this user yet.
                  </p>
                </div>
              ) : (
                <>
                  <div className="divide-y divide-border">
                    {logs.map((log) => (
                      <div
                        key={log.id}
                        className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 px-6 py-3 text-xs"
                      >
                        <span className="text-muted-foreground tabular-nums whitespace-nowrap shrink-0">
                          {new Date(log.createdAt).toLocaleString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <span className="font-medium text-foreground">{log.action}</span>
                        {log.target && (
                          <span className="text-muted-foreground truncate">{log.target}</span>
                        )}
                        {log.ipAddress && (
                          <span className="text-muted-foreground ml-auto shrink-0">
                            {log.ipAddress}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Activity pagination */}
                  {logsTotal > 20 && (
                    <div className="flex items-center justify-between px-6 py-3 border-t border-border text-xs text-muted-foreground">
                      <span>
                        {(logsPage - 1) * 20 + 1}–{Math.min(logsPage * 20, logsTotal)} of{' '}
                        {logsTotal}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={logsPage <= 1}
                          onClick={() => setLogsPage((p) => p - 1)}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={logsPage * 20 >= logsTotal}
                          onClick={() => setLogsPage((p) => p + 1)}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Sheet */}
      <UsersSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSaved={loadUser}
        mode="edit"
        user={user}
      />

      {/* Confirm delete */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{' '}
              <strong>
                {user.firstName} {user.lastName}
              </strong>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={executeDelete}
              disabled={actionPending}
            >
              {actionPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm toggle status */}
      <AlertDialog open={confirmToggle} onOpenChange={setConfirmToggle}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {user.status === 'active' ? 'Deactivate user' : 'Activate user'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {user.status === 'active'
                ? `Deactivating ${user.firstName} ${user.lastName} will prevent them from signing in.`
                : `Activating ${user.firstName} ${user.lastName} will restore their access.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeToggle} disabled={actionPending}>
              {actionPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {user.status === 'active' ? 'Deactivate' : 'Activate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
