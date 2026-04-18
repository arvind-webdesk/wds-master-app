'use client'

import { useEffect, useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2, User } from 'lucide-react'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import type { SafeUser } from '@/lib/db/schema/users'

// ── Schemas ───────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(80).trim(),
  lastName:  z.string().min(1, 'Last name is required').max(80).trim(),
  contactNo: z
    .string()
    .min(5, 'Contact number must be at least 5 characters')
    .max(40)
    .nullable()
    .or(z.literal('')),
  image: z
    .string()
    .url('Must be a valid URL')
    .max(1024)
    .nullable()
    .or(z.literal('')),
})

const passwordSchema = z
  .object({
    currentPassword:  z.string().min(1, 'Current password is required'),
    newPassword:      z.string().min(8, 'New password must be at least 8 characters').max(128),
    confirmNewPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((d) => d.newPassword === d.confirmNewPassword, {
    message: 'Passwords do not match',
    path: ['confirmNewPassword'],
  })

type ProfileValues  = z.infer<typeof profileSchema>
type PasswordValues = z.infer<typeof passwordSchema>

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(u: SafeUser | null) {
  if (!u) return 'U'
  return `${u.firstName?.[0] ?? ''}${u.lastName?.[0] ?? ''}`.toUpperCase() || 'U'
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

// ── Profile form ──────────────────────────────────────────────────────────────

interface ProfileFormProps {
  user: SafeUser
  onSaved: (updated: SafeUser) => void
}

function ProfileForm({ user, onSaved }: ProfileFormProps) {
  const [pending, startTransition] = useTransition()
  const [imagePreview, setImagePreview] = useState<string>(user.image ?? '')

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user.firstName,
      lastName:  user.lastName,
      contactNo: user.contactNo ?? '',
      image:     user.image ?? '',
    },
  })

  const watchedImage = form.watch('image')

  useEffect(() => {
    const v = watchedImage ?? ''
    setImagePreview(v)
  }, [watchedImage])

  function onSubmit(values: ProfileValues) {
    startTransition(async () => {
      // Send only dirty fields
      const dirtyKeys = Object.keys(form.formState.dirtyFields) as Array<keyof ProfileValues>
      if (dirtyKeys.length === 0) {
        toast.info('No changes to save.')
        return
      }

      const payload: Record<string, string | null> = {}
      for (const k of dirtyKeys) {
        const v = values[k]
        payload[k] = v === '' ? null : (v as string | null)
      }

      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error?.message ?? 'Failed to update profile.')
        return
      }
      toast.success('Profile updated.')
      const updated: SafeUser = json.data
      onSaved(updated)
      form.reset({
        firstName: updated.firstName,
        lastName:  updated.lastName,
        contactNo: updated.contactNo ?? '',
        image:     updated.image ?? '',
      })
    })
  }

  return (
    <Card className="rounded-[0.625rem] border border-border shadow-none">
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Profile details</CardTitle>
        <CardDescription>Update your display name, contact info and avatar.</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Avatar preview */}
        <div className="mb-5 flex items-center gap-4">
          <div className="relative h-24 w-24 rounded-[0.625rem] overflow-hidden border border-border bg-muted flex items-center justify-center">
            {imagePreview ? (
              <img
                src={imagePreview}
                alt="Avatar preview"
                className="h-full w-full object-cover"
                onError={() => setImagePreview('')}
              />
            ) : (
              <span className="text-2xl font-semibold text-muted-foreground">
                {initials(user)}
              </span>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{user.firstName} {user.lastName}</p>
            <p>{user.email}</p>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            {/* First + Last name row */}
            <div className="grid grid-cols-2 gap-3">
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

            {/* Email — read-only */}
            <FormItem>
              <FormLabel>Email address</FormLabel>
              <Input value={user.email} readOnly disabled className="bg-muted/40" />
              <FormDescription>Contact an admin to change your email address.</FormDescription>
            </FormItem>

            {/* Contact no */}
            <FormField
              control={form.control}
              name="contactNo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact number</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="+1 555 000 0000"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Image URL */}
            <FormField
              control={form.control}
              name="image"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Avatar URL</FormLabel>
                  <FormControl>
                    <Input
                      type="url"
                      placeholder="https://example.com/avatar.png"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormDescription>Paste a publicly accessible image URL.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end pt-1">
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save changes
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

// ── Password form ─────────────────────────────────────────────────────────────

function PasswordForm() {
  const [pending, startTransition] = useTransition()

  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword:    '',
      newPassword:        '',
      confirmNewPassword: '',
    },
  })

  function onSubmit(values: PasswordValues) {
    startTransition(async () => {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: values.currentPassword,
          newPassword:     values.newPassword,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (json.error?.message === 'Current password is incorrect') {
          form.setError('currentPassword', { message: 'Current password is incorrect' })
          return
        }
        toast.error(json.error?.message ?? 'Failed to update password.')
        return
      }
      toast.success('Password updated.')
      form.reset()
    })
  }

  return (
    <Card className="rounded-[0.625rem] border border-border shadow-none">
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Change password</CardTitle>
        <CardDescription>Enter your current password, then choose a new one.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Current password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" autoComplete="current-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormDescription>At least 8 characters.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmNewPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm new password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end pt-1">
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update password
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

// ── Account metadata card ─────────────────────────────────────────────────────

function AccountMetaCard({ user }: { user: SafeUser }) {
  const rows = [
    { label: 'Email',       value: user.email },
    { label: 'User type',   value: user.userType },
    { label: 'Status',      value: user.status },
    { label: 'Member since', value: formatDate(user.createdAt) },
  ]

  return (
    <Card className="rounded-[0.625rem] border border-border shadow-none">
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Account info</CardTitle>
        <CardDescription>Read-only details managed by an administrator.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-3">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex justify-between gap-4 text-sm">
              <dt className="text-muted-foreground shrink-0">{label}</dt>
              <dd className="text-foreground font-medium text-right truncate">{value ?? '—'}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AccountPage() {
  const [user, setUser] = useState<SafeUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadProfile() {
      setIsLoading(true)
      try {
        const res = await fetch('/api/account')
        if (!res.ok) throw new Error('Failed to load profile')
        const json = await res.json()
        setUser(json.data)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load profile')
      } finally {
        setIsLoading(false)
      }
    }
    loadProfile()
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <User className="h-10 w-10 opacity-40" />
        <p className="text-sm">Could not load your profile. Please refresh.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">My Account</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your profile, avatar and password.
        </p>
      </div>

      {/* Two-column grid: profile + password | metadata */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <ProfileForm
            user={user}
            onSaved={(updated) => setUser(updated)}
          />
          <PasswordForm />
        </div>
        <div>
          <AccountMetaCard user={user} />
        </div>
      </div>
    </div>
  )
}
