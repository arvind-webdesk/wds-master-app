# DataTable + Sheet + RHF + Zod Snippets

Canonical patterns for UI pages. Copy into new `app/(dashboard)/<slug>/page.tsx` etc.

## 1. List page shell

```tsx
'use client'

import { useState, useTransition } from 'react'
import useSWR, { useSWRConfig } from 'swr' // or native fetch + useEffect
import { DataTable } from '@/components/data-table/DataTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { columns } from './columns'
import { CreateSheet } from './create-sheet'

export default function Page() {
  const [page, setPage]   = useState(1)
  const [limit, setLimit] = useState(20)
  const [search, setSearch] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)

  const fetcher = (url: string) => fetch(url).then((r) => r.json())
  const qs = new URLSearchParams({ page: String(page), limit: String(limit), ...(search && { search }) })
  const { data, isLoading, mutate } = useSWR(`/api/<slug>?${qs}`, fetcher)
  const rows  = data?.data  ?? []
  const total = data?.meta?.total ?? 0

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Title</h1>
          <p className="text-sm text-muted-foreground">One-line description.</p>
        </div>
        <Button onClick={() => setSheetOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New Thing
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        total={total}
        page={page}
        limit={limit}
        isLoading={isLoading}
        onPageChange={setPage}
        onLimitChange={(n) => { setLimit(n); setPage(1) }}
        toolbar={
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search..."
              className="h-8 pl-8 text-xs"
            />
          </div>
        }
      />

      <CreateSheet open={sheetOpen} onOpenChange={setSheetOpen} onCreated={() => mutate()} />
    </div>
  )
}
```

## 2. TanStack columns

```tsx
'use client'
import { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type Row = { id: number; name: string; createdAt: string }

export const columns: ColumnDef<Row>[] = [
  { accessorKey: 'name', header: 'Name' },
  {
    accessorKey: 'createdAt',
    header: 'Created',
    cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(),
  },
  {
    id: 'actions',
    header: () => <span className="sr-only">Actions</span>,
    size: 40,
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7" />}>
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => { /* edit */ }}>Edit</DropdownMenuItem>
          <DropdownMenuItem onClick={() => { /* delete */ }} className="text-destructive">Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
]
```

## 3. Create Sheet (RHF + Zod + sonner)

```tsx
'use client'

import { useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
})
type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

export function CreateSheet({ open, onOpenChange, onCreated }: Props) {
  const [pending, startTransition] = useTransition()
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: '' } })

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const res = await fetch('/api/<slug>', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const payload = await res.json()
      if (!res.ok) { toast.error(payload.error?.message ?? 'Failed to create'); return }
      toast.success('Created successfully')
      form.reset()
      onCreated()
      onOpenChange(false)
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>New Thing</SheetTitle>
          <SheetDescription>Fill in the details below.</SheetDescription>
        </SheetHeader>
        <div className="p-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create
              </Button>
            </form>
          </Form>
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

## 4. Reminders

- **NEVER use `asChild`** on Sheet / Dialog / DropdownMenu / Command triggers — use `render={<Component />}`.
- `DropdownMenuLabel` renders as `<div>` in this project; do not wrap in `<DropdownMenuGroup>`.
- Trigger the command palette via `window.dispatchEvent(new CustomEvent('open-command-palette'))`.
- Use Tailwind v4 CSS-var classes only (`bg-background`, `text-muted-foreground`, `border-border`, `bg-accent`). No hex colors.
- Tables use `text-xs` (13px) for density. Main UI uses `text-sm` (14px).
- Use `useTransition` for every mutation so the UI stays responsive.
