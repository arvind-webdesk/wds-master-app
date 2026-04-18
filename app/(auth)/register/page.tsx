'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import Link from 'next/link'

const schema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName:  z.string().min(1, 'Last name is required'),
  email:     z.string().email('Please enter a valid email address'),
  password:  z.string().min(8, 'Password must be at least 8 characters'),
})
type FormValues = z.infer<typeof schema>

export default function RegisterPage() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: '', lastName: '', email: '', password: '' },
  })

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error?.message ?? 'Registration failed. Please try again.')
        return
      }
      toast.success('Account created — signing you in...')
      router.push('/dashboard')
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
            <CardTitle className="text-base">Create an account</CardTitle>
            <CardDescription>Fill in your details to get started</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
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
                          <Input placeholder="Smith" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

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

                <FormField
                  control={form.control}
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

                <Button type="submit" className="w-full mt-1" disabled={pending}>
                  {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create account
                </Button>
              </form>
            </Form>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              Already have an account?{' '}
              <Link href="/login" className="text-accent hover:underline">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
