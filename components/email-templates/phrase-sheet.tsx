'use client'

import { useEffect, useTransition } from 'react'
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import type { EmailPhrase } from './send-test-dialog'

// ─── Zod schema ───────────────────────────────────────────────────────────────

const schema = z.object({
  key: z
    .string()
    .trim()
    .min(1, 'Key is required')
    .max(100)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Only letters, numbers, underscores and dashes'),
  value: z.string().max(5000),
})

type FormValues = z.infer<typeof schema>

// ─── Props ────────────────────────────────────────────────────────────────────

interface PhraseSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templateId: number
  phrase: EmailPhrase | null  // null = create mode
  onSaved: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PhraseSheet({ open, onOpenChange, templateId, phrase, onSaved }: PhraseSheetProps) {
  const [pending, startTransition] = useTransition()
  const isEdit = !!phrase

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { key: '', value: '' },
  })

  // Reset when phrase prop changes (open new/edit row)
  useEffect(() => {
    if (open) {
      form.reset({
        key: phrase?.key ?? '',
        value: phrase?.value ?? '',
      })
    }
  }, [open, phrase]) // eslint-disable-line react-hooks/exhaustive-deps

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const url = isEdit
        ? `/api/email-templates/${templateId}/phrases/${phrase!.id}`
        : `/api/email-templates/${templateId}/phrases`
      const method = isEdit ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const payload = await res.json()

      if (!res.ok) {
        if (payload.error?.code === 'CONFLICT') {
          form.setError('key', { message: 'Phrase key already exists for this template' })
        } else {
          toast.error(payload.error?.message ?? `Failed to ${isEdit ? 'update' : 'create'} phrase`)
        }
        return
      }

      toast.success(isEdit ? 'Phrase updated' : 'Phrase added')
      onSaved()
      onOpenChange(false)
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
      <SheetContent side="right" className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Edit phrase' : 'Add phrase'}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? 'Update the phrase key or value.'
              : 'Define a new token that can be used in the template as {{key}}.'}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 mt-2">

              <FormField
                control={form.control}
                name="key"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Key</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="reset-link"
                        className="font-mono"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Used as <code className="text-xs">{'{{key}}'}</code> in the template subject and body.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Value</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Default substitution value"
                        rows={4}
                        className="resize-y"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Default value used when no override is provided at send time.
                    </FormDescription>
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
                  {isEdit ? 'Save changes' : 'Add phrase'}
                </Button>
              </SheetFooter>
            </form>
          </Form>
        </div>
      </SheetContent>
    </Sheet>
  )
}
