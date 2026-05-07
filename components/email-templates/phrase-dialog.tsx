'use client'

import { useEffect, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2, AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { applyServerErrors, parseFetchError } from '@/lib/form-errors'
import type { EmailPhrase } from './send-test-dialog'

/**
 * Create/edit an email-template phrase (key + value substitution).
 *
 * Per .claude/skills/record-form-layout/SKILL.md: 2 simple fields → Dialog.
 */

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

interface PhraseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templateId: number
  phrase: EmailPhrase | null  // null = create mode
  onSaved: () => void
}

export function PhraseDialog({ open, onOpenChange, templateId, phrase, onSaved }: PhraseDialogProps) {
  const [pending, startTransition] = useTransition()
  const isEdit = !!phrase

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { key: '', value: '' },
  })

  useEffect(() => {
    if (open) {
      form.reset({ key: phrase?.key ?? '', value: phrase?.value ?? '' })
    }
  }, [open, phrase]) // eslint-disable-line react-hooks/exhaustive-deps

  function onSubmit(values: FormValues) {
    form.clearErrors()
    startTransition(async () => {
      const url = isEdit
        ? `/api/email-templates/${templateId}/phrases/${phrase!.id}`
        : `/api/email-templates/${templateId}/phrases`
      const method = isEdit ? 'PATCH' : 'POST'

      let res: Response
      try {
        res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
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
          form.setError('key', { type: 'server', message: 'Phrase key already exists for this template' })
          return
        }
        applyServerErrors(form, payload, { fallbackField: 'key' })
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

  const rootError = form.formState.errors.root?.message

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit phrase' : 'Add phrase'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the phrase key or value.'
              : 'Define a new token that can be used in the template as {{key}}.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            id="phrase-dialog-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
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

            <FormField
              control={form.control}
              name="key"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Key</FormLabel>
                  <FormControl>
                    <Input placeholder="reset-link" autoComplete="off" className="font-mono" {...field} />
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
          </form>
        </Form>

        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />} disabled={pending}>
            Cancel
          </DialogClose>
          <Button type="submit" form="phrase-dialog-form" disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? 'Save changes' : 'Create phrase'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
