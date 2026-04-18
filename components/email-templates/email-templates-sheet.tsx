'use client'

import { useEffect, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

// ─── Zod schema ───────────────────────────────────────────────────────────────

const schema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  code: z
    .string()
    .trim()
    .min(2, 'Code must be at least 2 characters')
    .max(100)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lower-kebab-case (e.g. password-reset)'),
  subject: z.string().trim().min(1, 'Subject is required').max(300),
  emailType: z.string().trim().max(50).optional().or(z.literal('')),
  allowTo: z.string().trim().max(1000).optional().or(z.literal('')),
  status: z.enum(['active', 'inactive']),
})

type FormValues = z.infer<typeof schema>

// ─── Props ────────────────────────────────────────────────────────────────────

interface EmailTemplatesSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ─── Slug helper ──────────────────────────────────────────────────────────────

function toSlug(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100)
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EmailTemplatesSheet({ open, onOpenChange }: EmailTemplatesSheetProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      code: '',
      subject: '',
      emailType: '',
      allowTo: '',
      status: 'active',
    },
  })

  // Track whether user has manually edited code
  const codeManuallyEdited = form.formState.dirtyFields.code

  // Auto-derive code from title until user manually edits it
  const titleValue = form.watch('title')
  useEffect(() => {
    if (!codeManuallyEdited) {
      form.setValue('code', toSlug(titleValue), { shouldDirty: false })
    }
  }, [titleValue, codeManuallyEdited]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset form when sheet opens
  useEffect(() => {
    if (open) {
      form.reset()
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const body: Record<string, unknown> = {
        title: values.title,
        code: values.code,
        subject: values.subject,
        status: values.status,
        emailType: values.emailType || null,
        allowTo: values.allowTo || null,
        // body is not set here — user is redirected to editor page
        body: '',
      }

      const res = await fetch('/api/email-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await res.json()

      if (!res.ok) {
        if (payload.error?.code === 'CONFLICT') {
          form.setError('code', { message: 'This code is already in use' })
        } else {
          toast.error(payload.error?.message ?? 'Failed to create template')
        }
        return
      }

      toast.success('Template created')
      form.reset()
      onOpenChange(false)
      router.push(`/email-templates/${payload.data.id}`)
    })
  }

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
          <SheetTitle>New template</SheetTitle>
          <SheetDescription>
            Fill in the details to create a new email template. You can add the HTML body after creation.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 mt-2">

              {/* Title */}
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Password Reset" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Code */}
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="password-reset"
                        {...field}
                        onChange={(e) => {
                          field.onChange(e)
                          // mark as manually edited via RHF dirty tracking
                          form.setValue('code', e.target.value, { shouldDirty: true })
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      Stable identifier used in code (e.g. <code>password-reset</code>). Immutable after creation.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Subject */}
              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subject</FormLabel>
                    <FormControl>
                      <Input placeholder="Reset your password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Email type */}
              <FormField
                control={form.control}
                name="emailType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email type <span className="text-muted-foreground">(optional)</span></FormLabel>
                    <FormControl>
                      <Input placeholder="transactional" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Allow-to */}
              <FormField
                control={form.control}
                name="allowTo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Allow-to <span className="text-muted-foreground">(optional)</span></FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="user@example.com, *@example.com"
                        className="resize-none"
                        rows={2}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Comma-separated emails or wildcard domains that may receive this template.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Status switch */}
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-[0.625rem] border border-border px-3 py-2.5">
                    <div>
                      <FormLabel className="mb-0">Active</FormLabel>
                      <FormDescription className="text-xs">
                        Inactive templates cannot be sent.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value === 'active'}
                        onCheckedChange={(checked) =>
                          field.onChange(checked ? 'active' : 'inactive')
                        }
                      />
                    </FormControl>
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
                  Create template
                </Button>
              </SheetFooter>
            </form>
          </Form>
        </div>
      </SheetContent>
    </Sheet>
  )
}
