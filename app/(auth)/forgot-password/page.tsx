'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTransition, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, MailCheck } from 'lucide-react'
import Link from 'next/link'

const schema = z.object({
  email: z.string().email('Please enter a valid email address'),
})
type FormValues = z.infer<typeof schema>

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false)
  const [pending, startTransition] = useTransition()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  })

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error?.message ?? 'Something went wrong. Please try again.')
        return
      }
      setSubmitted(true)
    })
  }

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
            <CardTitle className="text-base">Reset your password</CardTitle>
            <CardDescription>
              {submitted
                ? 'Check your inbox for the reset link'
                : "Enter your email and we'll send you a reset link"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {submitted ? (
              <div className="flex flex-col items-center gap-4 py-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <MailCheck className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-center text-sm text-muted-foreground">
                  If an account exists for that email address, you will receive a password reset
                  link shortly.
                </p>
                <Link href="/login" className="text-sm text-accent hover:underline">
                  Back to sign in
                </Link>
              </div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="you@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full mt-1" disabled={pending}>
                    {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Send reset link
                  </Button>
                </form>
              </Form>
            )}

            {!submitted && (
              <p className="mt-4 text-center text-xs text-muted-foreground">
                Remember your password?{' '}
                <Link href="/login" className="text-accent hover:underline">
                  Sign in
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
