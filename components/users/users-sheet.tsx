'use client'

import { useEffect, useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAbility } from '@/lib/acl/ability-context'
import type { UserRow } from './users-columns'

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const baseSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(80),
  lastName: z.string().trim().min(1, 'Last name is required').max(80),
  email: z.string().trim().toLowerCase().email('Invalid email').max(254),
  contactNo: z.string().trim().max(40).optional().or(z.literal('')),
  image: z
    .string()
    .url('Must be a valid URL')
    .max(500)
    .optional()
    .or(z.literal('')),
  userType: z.enum(['superadmin', 'admin', 'user']),
  roleId: z
    .union([z.string(), z.number()])
    .transform((v) => (v === '' || v === null || v === undefined ? null : Number(v)))
    .nullable()
    .optional(),
  status: z.enum(['active', 'inactive']),
  portal: z.string().trim().max(60).optional().or(z.literal('')),
})

const createSchema = baseSchema.extend({
  password: z.string().min(8, 'At least 8 characters').max(128),
})

const editSchema = baseSchema

type CreateValues = z.infer<typeof createSchema>
type EditValues = z.infer<typeof editSchema>

// ─── Role option type ─────────────────────────────────────────────────────────

type RoleOption = { id: number; name: string }

// ─── Props ────────────────────────────────────────────────────────────────────

interface UsersSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  mode: 'create' | 'edit'
  user?: UserRow | null
}

// ─── Component ────────────────────────────────────────────────────────────────

export function UsersSheet({
  open,
  onOpenChange,
  onSaved,
  mode,
  user,
}: UsersSheetProps) {
  const ability = useAbility()
  const isSuperadmin = ability.can('create', 'User') && ability.can('manage', 'all')
  // Simpler check: detect superadmin via userType on session is not available client-side,
  // so we gate the Superadmin option based on whether the current user has broad manage all,
  // which only superadmins get. Fallback: always allow selecting admin/user.

  const [pending, startTransition] = useTransition()
  const [roles, setRoles] = useState<RoleOption[]>([])

  // Fetch roles for the select
  useEffect(() => {
    fetch('/api/roles?limit=100')
      .then((r) => r.json())
      .then((json) => {
        if (json.data) setRoles(json.data)
      })
      .catch(() => {/* silently ignore */})
  }, [])

  // ── Create form ──
  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      contactNo: '',
      image: '',
      userType: 'admin',
      roleId: null,
      status: 'active',
      portal: '',
    },
  })

  // ── Edit form ──
  const editForm = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      email: user?.email ?? '',
      contactNo: user?.contactNo ?? '',
      image: user?.image ?? '',
      userType: user?.userType ?? 'admin',
      roleId: user?.roleId ?? null,
      status: user?.status ?? 'active',
      portal: user?.portal ?? '',
    },
  })

  // Reset edit form when user changes
  useEffect(() => {
    if (mode === 'edit' && user) {
      editForm.reset({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        contactNo: user.contactNo ?? '',
        image: user.image ?? '',
        userType: user.userType,
        roleId: user.roleId ?? null,
        status: user.status,
        portal: user.portal ?? '',
      })
    }
  }, [user, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset create form on open
  useEffect(() => {
    if (open && mode === 'create') {
      createForm.reset()
    }
  }, [open, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Submit: Create ──
  function onCreateSubmit(values: CreateValues) {
    startTransition(async () => {
      const body: Record<string, unknown> = { ...values }
      // Normalize empty strings to null/undefined
      if (!body.contactNo) delete body.contactNo
      if (!body.image) delete body.image
      if (!body.portal) delete body.portal

      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await res.json()
      if (!res.ok) {
        const msg = payload.error?.message ?? 'Failed to create user'
        if (payload.error?.code === 'CONFLICT') {
          createForm.setError('email', { message: 'Email already in use' })
        } else if (payload.error?.code === 'VALIDATION_ERROR') {
          toast.error(msg)
        } else {
          toast.error(msg)
        }
        return
      }
      toast.success('User created successfully')
      createForm.reset()
      onSaved()
      onOpenChange(false)
    })
  }

  // ── Submit: Edit ──
  function onEditSubmit(values: EditValues) {
    if (!user) return
    startTransition(async () => {
      const body: Record<string, unknown> = { ...values }
      if (!body.contactNo) body.contactNo = null
      if (!body.image) body.image = null
      if (!body.portal) body.portal = null

      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await res.json()
      if (!res.ok) {
        const msg = payload.error?.message ?? 'Failed to update user'
        if (payload.error?.code === 'CONFLICT') {
          editForm.setError('email', { message: 'Email already in use' })
        } else {
          toast.error(msg)
        }
        return
      }
      toast.success('User updated successfully')
      onSaved()
      onOpenChange(false)
    })
  }

  const isCreate = mode === 'create'
  const form = isCreate ? createForm : editForm
  const onSubmit = isCreate
    ? createForm.handleSubmit(onCreateSubmit)
    : editForm.handleSubmit(onEditSubmit)

  // ── Close guard: warn if dirty ──
  function handleOpenChange(next: boolean) {
    if (!next && form.formState.isDirty) {
      if (!window.confirm('You have unsaved changes. Discard them?')) return
    }
    onOpenChange(next)
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isCreate ? 'New user' : 'Edit user'}</SheetTitle>
          <SheetDescription>
            {isCreate
              ? 'Fill in the details below to create a new user.'
              : 'Update the user profile details below.'}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-4">
          {/* Create form */}
          {isCreate && (
            <Form {...createForm}>
              <form onSubmit={onSubmit} className="flex flex-col gap-4 mt-2">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={createForm.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First name</FormLabel>
                        <FormControl>
                          <Input placeholder="Jane" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last name</FormLabel>
                        <FormControl>
                          <Input placeholder="Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={createForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="jane@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={createForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Min. 8 characters" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={createForm.control}
                  name="contactNo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact number</FormLabel>
                      <FormControl>
                        <Input type="tel" placeholder="+1 555 000 0000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={createForm.control}
                  name="image"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Avatar URL</FormLabel>
                      <FormControl>
                        <Input type="url" placeholder="https://..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={createForm.control}
                    name="userType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>User type</FormLabel>
                        <FormControl>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="superadmin" disabled={!isSuperadmin}>
                                Superadmin
                              </SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="user">User</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={createForm.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <FormControl>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="inactive">Inactive</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={createForm.control}
                  name="roleId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value != null ? String(field.value) : ''}
                          onValueChange={(v) => field.onChange(v === '' ? null : Number(v))}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="No role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">No role</SelectItem>
                            {roles.map((r) => (
                              <SelectItem key={r.id} value={String(r.id)}>
                                {r.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={createForm.control}
                  name="portal"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Portal</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. admin" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <SheetFooter className="px-0 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleOpenChange(false)}
                    disabled={pending}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={pending}>
                    {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create user
                  </Button>
                </SheetFooter>
              </form>
            </Form>
          )}

          {/* Edit form */}
          {!isCreate && (
            <Form {...editForm}>
              <form onSubmit={onSubmit} className="flex flex-col gap-4 mt-2">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={editForm.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First name</FormLabel>
                        <FormControl>
                          <Input placeholder="Jane" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last name</FormLabel>
                        <FormControl>
                          <Input placeholder="Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={editForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="jane@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="contactNo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact number</FormLabel>
                      <FormControl>
                        <Input type="tel" placeholder="+1 555 000 0000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="image"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Avatar URL</FormLabel>
                      <FormControl>
                        <Input type="url" placeholder="https://..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={editForm.control}
                    name="userType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>User type</FormLabel>
                        <FormControl>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="superadmin" disabled={!isSuperadmin}>
                                Superadmin
                              </SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="user">User</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={editForm.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <FormControl>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="inactive">Inactive</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={editForm.control}
                  name="roleId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value != null ? String(field.value) : ''}
                          onValueChange={(v) => field.onChange(v === '' ? null : Number(v))}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="No role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">No role</SelectItem>
                            {roles.map((r) => (
                              <SelectItem key={r.id} value={String(r.id)}>
                                {r.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="portal"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Portal</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. admin" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <SheetFooter className="px-0 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleOpenChange(false)}
                    disabled={pending}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={pending}>
                    {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save changes
                  </Button>
                </SheetFooter>
              </form>
            </Form>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
