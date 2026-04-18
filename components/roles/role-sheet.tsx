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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import type { RoleWithCounts } from './role-columns'

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(64, 'Max 64 characters'),
  description: z
    .string()
    .trim()
    .max(500, 'Max 500 characters')
    .optional(),
})

type FormValues = z.infer<typeof schema>

interface RoleSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When provided, the sheet operates in edit mode */
  editRole?: RoleWithCounts | null
  onSuccess: () => void
}

export function RoleSheet({ open, onOpenChange, editRole, onSuccess }: RoleSheetProps) {
  const isEdit = !!editRole
  const [pending, startTransition] = useTransition()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '' },
  })

  // Populate form when editing
  useEffect(() => {
    if (open && editRole) {
      form.reset({
        name: editRole.name,
        description: editRole.description ?? '',
      })
    } else if (open && !editRole) {
      form.reset({ name: '', description: '' })
    }
  }, [open, editRole, form])

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const url = isEdit ? `/api/roles/${editRole!.id}` : '/api/roles'
      const method = isEdit ? 'PATCH' : 'POST'

      const body: Record<string, unknown> = { name: values.name }
      if (values.description !== undefined) {
        body.description = values.description === '' ? null : values.description
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const payload = await res.json()

      if (!res.ok) {
        if (res.status === 409) {
          form.setError('name', {
            message: payload.error?.message ?? 'A role with this name already exists',
          })
          return
        }
        toast.error(payload.error?.message ?? `Failed to ${isEdit ? 'update' : 'create'} role`)
        return
      }

      toast.success(isEdit ? 'Role updated' : 'Role created')
      form.reset()
      onSuccess()
      onOpenChange(false)
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Edit role' : 'New role'}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? 'Update the role name or description.'
              : 'Create a new role. Assign permissions from the role detail page.'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-2">
          <Form {...form}>
            <form
              id="role-form"
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex flex-col gap-4 pt-2"
            >
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
                        className="rounded-md border-input"
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
                        className="rounded-md border-input resize-none min-h-24"
                        disabled={pending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </div>

        <SheetFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="submit" form="role-form" disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? 'Save changes' : 'Create role'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
