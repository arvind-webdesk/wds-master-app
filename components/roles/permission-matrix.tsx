'use client'

import { useState, useEffect, useTransition, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Loader2, Save, RotateCcw } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { PERMISSION_MODULES, type PermissionAction } from '@/lib/acl/permissions-map'
import type { AppAbility } from '@/lib/acl/ability'

// Canonical action columns
const ALL_ACTIONS: PermissionAction[] = ['view', 'add', 'edit', 'delete', 'activate']

type MatrixState = Record<string, Record<string, boolean>>

interface PermissionEntry {
  id: number | null
  name: string
  action: string
  module: string
  enabled: boolean
}

interface PermissionMatrixData {
  roleId: number
  permissions: PermissionEntry[]
}

interface PermissionMatrixProps {
  roleId: number
  can: AppAbility['can']
}

function buildMatrix(permissions: PermissionEntry[]): MatrixState {
  const matrix: MatrixState = {}
  for (const mod of PERMISSION_MODULES) {
    matrix[mod.key] = {}
    for (const action of mod.actions) {
      const entry = permissions.find((p) => p.name === mod.key && p.action === action)
      matrix[mod.key][action] = entry?.enabled ?? false
    }
  }
  return matrix
}

function matrixEqual(a: MatrixState, b: MatrixState): boolean {
  for (const mod of PERMISSION_MODULES) {
    for (const action of mod.actions) {
      if ((a[mod.key]?.[action] ?? false) !== (b[mod.key]?.[action] ?? false)) return false
    }
  }
  return true
}

function flattenEnabled(matrix: MatrixState): Array<{ name: string; action: string }> {
  const result: Array<{ name: string; action: string }> = []
  for (const [modKey, actions] of Object.entries(matrix)) {
    for (const [action, enabled] of Object.entries(actions)) {
      if (enabled) result.push({ name: modKey, action })
    }
  }
  return result
}

export function PermissionMatrix({ roleId, can }: PermissionMatrixProps) {
  const [baseline, setBaseline] = useState<MatrixState>({})
  const [matrix, setMatrix] = useState<MatrixState>({})
  const [isLoading, setIsLoading] = useState(true)
  const [savePending, startSave] = useTransition()

  const canEdit = can('update', 'Role')
  const isDirty = !matrixEqual(matrix, baseline)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/roles/${roleId}/permissions`)
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error?.message ?? 'Failed to load permissions')
        return
      }
      const data: PermissionMatrixData = json.data
      const built = buildMatrix(data.permissions)
      setBaseline(built)
      setMatrix(built)
    } catch {
      toast.error('Failed to load permissions')
    } finally {
      setIsLoading(false)
    }
  }, [roleId])

  useEffect(() => {
    load()
  }, [load])

  function setCell(modKey: string, action: string, value: boolean) {
    if (!canEdit) return
    setMatrix((prev) => ({
      ...prev,
      [modKey]: { ...prev[modKey], [action]: value },
    }))
  }

  function toggleRow(modKey: string) {
    if (!canEdit) return
    const mod = PERMISSION_MODULES.find((m) => m.key === modKey)
    if (!mod) return
    const allOn = mod.actions.every((a) => matrix[modKey]?.[a])
    setMatrix((prev) => ({
      ...prev,
      [modKey]: Object.fromEntries(mod.actions.map((a) => [a, !allOn])),
    }))
  }

  function toggleColumn(action: PermissionAction) {
    if (!canEdit) return
    const supportingMods = PERMISSION_MODULES.filter((m) =>
      (m.actions as readonly string[]).includes(action)
    )
    const allOn = supportingMods.every((m) => matrix[m.key]?.[action])
    setMatrix((prev) => {
      const next = { ...prev }
      for (const mod of supportingMods) {
        next[mod.key] = { ...next[mod.key], [action]: !allOn }
      }
      return next
    })
  }

  function handleSave() {
    startSave(async () => {
      const permissions = flattenEnabled(matrix)
      const res = await fetch(`/api/roles/${roleId}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error?.message ?? 'Failed to save permissions')
        return
      }
      setBaseline(matrix)
      toast.success('Permissions updated')
    })
  }

  function handleDiscard() {
    setMatrix(baseline)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading permissions…
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Matrix table */}
      <div className="rounded-[0.625rem] border border-border overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-44 sticky left-0 bg-muted/40 z-10">
                Module
              </th>
              {/* Row-toggle column header */}
              <th className="px-3 py-2.5 font-medium text-muted-foreground text-center w-12">
                All
              </th>
              {ALL_ACTIONS.map((action) => (
                <th
                  key={action}
                  className="px-3 py-2.5 font-medium text-muted-foreground text-center capitalize w-24"
                >
                  <div className="flex flex-col items-center gap-1.5">
                    <span>{action}</span>
                    {canEdit && (
                      <Checkbox
                        checked={(() => {
                          const supporting = PERMISSION_MODULES.filter((m) =>
                            (m.actions as readonly string[]).includes(action)
                          )
                          if (supporting.length === 0) return false
                          return supporting.every((m) => matrix[m.key]?.[action])
                        })()}
                        onCheckedChange={() => toggleColumn(action)}
                        aria-label={`Toggle all ${action}`}
                        disabled={
                          PERMISSION_MODULES.filter((m) =>
                            (m.actions as readonly string[]).includes(action)
                          ).length === 0
                        }
                      />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_MODULES.map((mod, idx) => {
              const rowAllOn = mod.actions.every((a) => matrix[mod.key]?.[a])

              return (
                <tr
                  key={mod.key}
                  className={
                    idx % 2 === 0
                      ? 'bg-background hover:bg-muted/20'
                      : 'bg-muted/10 hover:bg-muted/30'
                  }
                >
                  {/* Module label */}
                  <td className="px-4 py-3 font-medium text-foreground sticky left-0 bg-inherit z-10">
                    {mod.label}
                  </td>

                  {/* Row-toggle checkbox */}
                  <td className="px-3 py-3 text-center">
                    {canEdit ? (
                      <Checkbox
                        checked={rowAllOn}
                        onCheckedChange={() => toggleRow(mod.key)}
                        aria-label={`Toggle all permissions for ${mod.label}`}
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* Action cells */}
                  {ALL_ACTIONS.map((action) => {
                    const supported = (mod.actions as readonly string[]).includes(action)
                    return (
                      <td key={action} className="px-3 py-3 text-center">
                        {supported ? (
                          <Checkbox
                            checked={matrix[mod.key]?.[action] ?? false}
                            onCheckedChange={(checked) =>
                              setCell(mod.key, action, !!checked)
                            }
                            disabled={!canEdit}
                            aria-label={`${mod.label} ${action}`}
                          />
                        ) : (
                          <span className="inline-block w-4 h-px border-t border-dashed border-border" />
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Sticky dirty footer */}
      <AnimatePresence>
        {isDirty && canEdit && (
          <motion.div
            key="dirty-footer"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="sticky bottom-0 mt-4 flex items-center justify-between gap-3 rounded-[0.625rem] border border-border bg-background/95 px-4 py-3 shadow-lg backdrop-blur-sm"
          >
            <p className="text-sm text-muted-foreground">You have unsaved changes.</p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDiscard}
                disabled={savePending}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Discard
              </Button>
              <Button size="sm" onClick={handleSave} disabled={savePending}>
                {savePending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                )}
                Save changes
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
