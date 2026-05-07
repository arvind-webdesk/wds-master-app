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
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { applyServerErrors, parseFetchError } from '@/lib/form-errors'
import type { RoleWithCounts } from './role-columns'

/**
 * Create/edit a role (name + description).
 *
 * Per .claude/skills/record-form-layout/SKILL.md: 2 simple fields → Dialog.
 */

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(64, 'Max 64 characters'),
  description: z.string().trim().max(500, 'Max 500 characters').optional(),
})

type FormValues = z.infer<typeof schema>

interface RoleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When provided, the dialog operates in edit mode */
  editRole?: RoleWithCounts | null
  onSuccess: () => void
}

export function RoleDialog({ open, onOpenChange, editRole, onSuccess }: RoleDialogProps) {
  const isEdit = !!editRole
  const [pending, startTransition] = useTransition()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '' },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        name:        editRole?.name        ?? '',
        description: editRole?.description ?? '',
      })
    }
  }, [open, editRole, form])

  function onSubmit(values: FormValues) {
    form.clearErrors()
    startTransition(async () => {
      const url    = isEdit ? `/api/roles/${editRole!.id}` : '/api/roles'
      const method = isEdit ? 'PATCH' : 'POST'
      const body: Record<string, unknown> = { name: values.name }
      if (values.description !== undefined) {
        body.description = values.description === '' ? null : values.description
      }

      let res: Response
      try {
        res = await fetch(url, {
          method,
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
        if (res.status === 409) {
          form.setError('name', {
            type: 'server',
            message: payload.message ?? 'A role with this name already exists',
          })
          return
        }
        applyServerErrors(form, payload, { fallbackField: 'name' })
        return
      }

      toast.success(isEdit ? 'Role updated' : 'Role created')
      form.reset()
      onSuccess()
      onOpenChange(false)
    })
  }

  const rootError = form.formState.errors.root?.message

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit role' : 'New role'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the role name or description.'
              : 'Create a new role. Assign permissions from the role detail page.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            id="role-dialog-form"
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
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="e.g. Editor"
                      autoComplete="off"
                      disabled={pending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="What can this role do?"
                      className="resize-none min-h-24"
                      disabled={pending}
                    />
                  </FormControl>
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
          <Button type="submit" form="role-dialog-form" disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? 'Save changes' : 'Create role'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
