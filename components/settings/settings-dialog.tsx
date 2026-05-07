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
import type { Setting } from '@/lib/db/schema/settings'

/**
 * Create/edit a system settings row (key/value).
 *
 * Per project standard (.claude/skills/record-form-layout/SKILL.md):
 * forms with ≤3 simple fields use a Dialog. Setting has 2 fields (key,
 * value) so a Dialog is the right surface.
 */

const KEY_REGEX = /^[a-z0-9]+(\.[a-z0-9_-]+)+$/

const schema = z.object({
  key: z
    .string()
    .min(1, 'Key is required')
    .max(128, 'Key must be ≤ 128 characters')
    .regex(KEY_REGEX, 'Key must be lowercase dot-separated (e.g. site.name)'),
  value: z
    .string()
    .max(10_000, 'Value must be ≤ 10,000 characters')
    .nullable(),
})

type FormValues = z.infer<typeof schema>

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Existing row when editing; undefined when creating */
  row?: Setting
  onSuccess: () => void
}

export function SettingsDialog({ open, onOpenChange, row, onSuccess }: SettingsDialogProps) {
  const isEdit = Boolean(row)
  const [pending, startTransition] = useTransition()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { key: '', value: '' },
  })

  const valueLength = form.watch('value')?.length ?? 0

  useEffect(() => {
    if (open) {
      form.reset({
        key:   row?.key   ?? '',
        value: row?.value ?? '',
      })
    }
  }, [open, row, form])

  function onSubmit(values: FormValues) {
    form.clearErrors()
    startTransition(async () => {
      let res: Response
      try {
        const encodedKey = encodeURIComponent(values.key)
        res = await fetch(`/api/settings/${encodedKey}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: values.value }),
        })
      } catch {
        const message = 'Could not reach the server. Check your connection and try again.'
        form.setError('root', { type: 'network', message })
        toast.error(message)
        return
      }
      if (!res.ok) {
        const payload = await parseFetchError(res)
        applyServerErrors(form, payload, { fallbackField: 'value' })
        return
      }
      toast.success('Setting saved.')
      onOpenChange(false)
      onSuccess()
    })
  }

  const rootError = form.formState.errors.root?.message

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit setting' : 'New setting'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the value for this configuration key.'
              : 'Add a new key/value pair to the application settings.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            id="settings-dialog-form"
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
                    <Input
                      placeholder="site.name"
                      disabled={isEdit}
                      autoComplete="off"
                      className="font-mono"
                      {...field}
                    />
                  </FormControl>
                  {!isEdit ? (
                    <FormDescription>
                      Lowercase dot-separated identifier (e.g. <code className="font-mono text-xs">site.name</code>)
                    </FormDescription>
                  ) : null}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="value"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Value</FormLabel>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {valueLength} / 10,000
                    </span>
                  </div>
                  <FormControl>
                    <Textarea
                      placeholder="Enter value…"
                      rows={6}
                      maxLength={10_000}
                      className="resize-none font-mono text-xs"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormDescription>
                    Leave empty to store an explicit null/empty value.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />} disabled={pending}>
            Cancel
          </DialogClose>
          <Button type="submit" form="settings-dialog-form" disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
