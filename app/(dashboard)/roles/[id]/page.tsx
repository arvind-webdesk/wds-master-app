'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Users, Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { PermissionMatrix } from '@/components/roles/permission-matrix'
import { RoleSheet } from '@/components/roles/role-sheet'
import { useAbility } from '@/lib/acl/ability-context'
import type { RoleWithCounts } from '@/components/roles/role-columns'

export default function RoleDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const ability = useAbility()
  const roleId = Number(params.id)

  const [role, setRole] = useState<RoleWithCounts | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)

  const canUpdate = ability.can('update', 'Role')

  const loadRole = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/roles/${roleId}`)
      const json = await res.json()
      if (!res.ok) {
        if (res.status === 404) {
          toast.error('Role not found')
          router.push('/roles')
          return
        }
        toast.error(json.error?.message ?? 'Failed to load role')
        return
      }
      setRole(json.data)
    } catch {
      toast.error('Failed to load role')
    } finally {
      setIsLoading(false)
    }
  }, [roleId, router])

  useEffect(() => {
    if (!isNaN(roleId) && roleId > 0) {
      loadRole()
    } else {
      router.push('/roles')
    }
  }, [roleId, loadRole, router])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading role…</span>
      </div>
    )
  }

  if (!role) return null

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Back navigation */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 -ml-2 text-muted-foreground hover:text-foreground"
          onClick={() => router.push('/roles')}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All roles
        </Button>
      </div>

      {/* Header card */}
      <Card className="rounded-[0.625rem] border border-border shadow-none">
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-foreground truncate">
                {role.name}
              </h1>
              {role.description && (
                <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                  {role.description}
                </p>
              )}
            </div>
          </div>

          {canUpdate && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => setSheetOpen(true)}
            >
              Edit role
            </Button>
          )}
        </CardHeader>

        <CardContent className="pt-0">
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="secondary" className="gap-1">
              <Users className="h-3 w-3" />
              {role.userCount} {role.userCount === 1 ? 'user' : 'users'}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <ShieldCheck className="h-3 w-3" />
              {role.permissionCount} {role.permissionCount === 1 ? 'permission' : 'permissions'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Permission matrix */}
      <div>
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-foreground">Permission Matrix</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {canUpdate
              ? 'Check the actions this role is allowed to perform per module. Save when done.'
              : 'Read-only view of permissions assigned to this role.'}
          </p>
        </div>
        <PermissionMatrix roleId={roleId} can={ability.can.bind(ability)} />
      </div>

      {/* Edit sheet */}
      <RoleSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editRole={role}
        onSuccess={loadRole}
      />
    </div>
  )
}
