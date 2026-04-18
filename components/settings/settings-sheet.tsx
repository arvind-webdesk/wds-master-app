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
  SheetClose,
} from '@/components/ui/sheet'
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
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import type { Setting } from '@/lib/db/schema/settings'

// ── Schema ────────────────────────────────────────────────────────────────────

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

// ── Props ─────────────────────────────────────────────────────────────────────

interface SettingsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Existing row when editing; undefined when creating */
  row?: Setting
  onSuccess: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SettingsSheet({ open, onOpenChange, row, onSuccess }: SettingsSheetProps) {
  const isEdit = Boolean(row)
  const [pending, startTransition] = useTransition()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { key: '', value: '' },
  })

  const valueLength = form.watch('value')?.length ?? 0

  // Populate form when row changes
  useEffect(() => {
    if (open) {
      form.reset({
        key: row?.key ?? '',
        value: row?.value ?? '',
      })
    }
  }, [open, row, form])

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const encodedKey = encodeURIComponent(values.key)
      const res = await fetch(`/api/settings/${encodedKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: values.value }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error?.message ?? 'Failed to save setting.')
        return
      }
      toast.success('Setting saved.')
      onOpenChange(false)
      onSuccess()
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-6 py-4">
          <SheetTitle>{isEdit ? 'Edit setting' : 'New setting'}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? 'Update the value for this configuration key.'
              : 'Add a new key/value pair to the application settings.'}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-1 flex-col overflow-y-auto"
          >
            <div className="flex flex-col gap-5 px-6 py-5">
              {/* Key */}
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
                        className="font-mono"
                        {...field}
                      />
                    </FormControl>
                    {!isEdit && (
                      <FormDescription>
                        Lowercase dot-separated identifier (e.g. <code className="font-mono text-xs">site.name</code>)
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Value */}
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
            </div>

            <SheetFooter className="border-t border-border px-6 py-4">
              <SheetClose
                render={<Button variant="outline" type="button" />}
                disabled={pending}
              >
                Cancel
              </SheetClose>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
