'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { AlertCircle, Loader2 } from 'lucide-react'
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAbility } from '@/lib/acl/ability-context'
import { applyServerErrors, parseFetchError } from '@/lib/form-errors'
import type { UserRow } from './users-columns'

const schema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(80),
  lastName: z.string().trim().min(1, 'Last name is required').max(80),
  email: z.string().trim().toLowerCase().email('Invalid email').max(254),
  password: z.string().max(128),
  contactNo: z.string().trim().max(40),
  image: z.string().trim().max(500),
  userType: z.enum(['superadmin', 'admin', 'user']),
  roleId: z.number().int().nullable(),
  status: z.enum(['active', 'inactive']),
  portal: z.string().trim().max(60),
})

type FormValues = z.infer<typeof schema>

type RoleOption = { id: number; name: string }

interface Props {
  mode: 'create' | 'edit'
  initialValues?: UserRow
}

export function UsersForm({ mode, initialValues }: Props) {
  const router = useRouter()
  const ability = useAbility()
  const isSuperadmin = ability.can('create', 'User') && ability.can('manage', 'all')
  const isCreate = mode === 'create'

  const [pending, startTransition] = useTransition()
  const [roles, setRoles] = useState<RoleOption[]>([])

  useEffect(() => {
    fetch('/api/roles?limit=100')
      .then((r) => r.json())
      .then((json) => {
        if (json.data) setRoles(json.data)
      })
      .catch(() => {})
  }, [])

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: initialValues?.firstName ?? '',
      lastName: initialValues?.lastName ?? '',
      email: initialValues?.email ?? '',
      password: '',
      contactNo: initialValues?.contactNo ?? '',
      image: initialValues?.image ?? '',
      userType: initialValues?.userType ?? 'admin',
      roleId: initialValues?.roleId ?? null,
      status: initialValues?.status ?? 'active',
      portal: initialValues?.portal ?? '',
    },
  })

  function onSubmit(values: FormValues) {
    form.clearErrors()

    if (isCreate && (!values.password || values.password.length < 8)) {
      form.setError('password', { type: 'manual', message: 'At least 8 characters' })
      return
    }
    if (values.image && !/^https?:\/\/.+/.test(values.image)) {
      form.setError('image', { type: 'manual', message: 'Must be a valid URL' })
      return
    }

    startTransition(async () => {
      const body: Record<string, unknown> = {
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        userType: values.userType,
        roleId: values.roleId,
        status: values.status,
      }
      if (isCreate) {
        body.password = values.password
        if (values.contactNo) body.contactNo = values.contactNo
        if (values.image) body.image = values.image
        if (values.portal) body.portal = values.portal
      } else {
        body.contactNo = values.contactNo || null
        body.image = values.image || null
        body.portal = values.portal || null
      }

      let res: Response
      try {
        res = isCreate
          ? await fetch('/api/users', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
          : await fetch(`/api/users/${initialValues!.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
      } catch {
        const message = 'Could not reach the server. Check your connection and try again.'
        form.setError('root', { type: 'network', message })
        toast.error(message)
        return
      }

      if (!res.ok) {
        const payload = await parseFetchError(res)
        if (payload.code === 'CONFLICT') {
          form.setError('email', {
            type: 'server',
            message: payload.message ?? 'Email already in use',
          })
          return
        }
        applyServerErrors(form, payload, { fallbackField: 'email' })
        return
      }

      toast.success(isCreate ? 'User created successfully' : 'User updated successfully')
      router.push('/users')
      router.refresh()
    })
  }

  const rootError = form.formState.errors.root?.message

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4 max-w-3xl"
        noValidate
      >
        {rootError ? (
          <div
            role="alert"
            aria-live="polite"
            className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{rootError}</p>
          </div>
        ) : null}

        {/* ─── Profile section ───────────────────────────────────────────── */}
        <Card className="rounded-[0.625rem] border-border shadow-none">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Profile</CardTitle>
            <CardDescription>Personal information and contact details.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
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
                control={form.control}
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

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
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
                control={form.control}
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
            </div>

            <FormField
              control={form.control}
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
          </CardContent>
        </Card>

        {/* ─── Access section ────────────────────────────────────────────── */}
        <Card className="rounded-[0.625rem] border-border shadow-none">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Access</CardTitle>
            <CardDescription>
              {isCreate
                ? 'Set the initial password and assign a role.'
                : 'Manage user type, role, status and portal.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {isCreate && (
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Min. 8 characters"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="userType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>User type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="superadmin" disabled={!isSuperadmin}>
                          Superadmin
                        </SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="user">User</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="roleId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select
                      value={field.value != null ? String(field.value) : 'none'}
                      onValueChange={(v) => field.onChange(v === 'none' ? null : Number(v))}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="No role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No role</SelectItem>
                        {roles.map((r) => (
                          <SelectItem key={r.id} value={String(r.id)}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
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
            </div>
          </CardContent>
        </Card>

        {/* ─── Actions ───────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isCreate ? 'Create user' : 'Save changes'}
          </Button>
          <Button
            variant="outline"
            disabled={pending}
            nativeButton={false}
            render={<Link href="/users" />}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  )
}
