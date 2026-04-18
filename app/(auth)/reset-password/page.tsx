'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition, Suspense } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import Link from 'next/link'

const schema = z
  .object({
    password:        z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
type FormValues = z.infer<typeof schema>

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [pending, startTransition] = useTransition()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  function onSubmit(values: FormValues) {
    if (!token) {
      toast.error('Reset token is missing. Please request a new link.')
      return
    }
    startTransition(async () => {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: values.password }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error?.message ?? 'Reset failed. Please request a new link.')
        return
      }
      toast.success('Password updated — sign in with your new password')
      router.push('/login')
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <Input type="password" placeholder="Min. 8 characters" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm password</FormLabel>
              <FormControl>
                <Input type="password" placeholder="••••••••" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full mt-1" disabled={pending || !token}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Set new password
        </Button>
      </form>
    </Form>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-lg mb-3">
            W
          </div>
          <h1 className="text-lg font-semibold">WDS Dashboard</h1>
        </div>

        <Card className="border-border shadow-none">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Set a new password</CardTitle>
            <CardDescription>Choose a strong password for your account</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<div className="h-32 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>}>
              <ResetPasswordForm />
            </Suspense>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              <Link href="/login" className="text-accent hover:underline">
                Back to sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
