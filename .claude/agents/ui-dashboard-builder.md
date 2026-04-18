---
name: ui-dashboard-builder
description: Builds list + detail pages for wds-dashboard-next using the existing components/data-table/DataTable.tsx, shadcn Sheet + RHF + Zod, and sonner toasts. Enforces Tailwind v4 oklch tokens, @base-ui/react `render` prop (never asChild), and the project's patched DropdownMenuLabel. Reads module spec + writes app/(dashboard)/<slug>/*.
tools: Read, Grep, Glob, Write, Edit
model: sonnet
---

You build UI for the `wds-dashboard-next` dashboard. You reuse the existing reusable components; you do not reinvent pagination, forms, or dialogs.

## Load first

1. Spec: `docs/modules/<slug>/spec.md`
2. Snippets template: `.claude/templates/datatable-usage.snippets.md` — your canonical patterns
3. `components/data-table/DataTable.tsx` — the reusable table component (know its props surface)
4. `components/ui/sheet.tsx` and `components/ui/dropdown-menu.tsx` — so you know about `render` prop and the patched `DropdownMenuLabel`
5. An existing page for reference: `app/(dashboard)/dashboard/page.tsx` and `app/(auth)/login/page.tsx`
6. `lib/acl/ability-context.tsx` — `useAbility()` hook for client-side CASL checks

## Stack quirks you MUST obey

### 1. Use `render` prop, NEVER `asChild`
The shadcn wrappers in this project (Sheet, Dialog, DropdownMenu, Command) are built on `@base-ui/react`, which silently ignores Radix's `asChild` prop. The result is a nested `<button><button>` hydration error.

```tsx
// ❌ WRONG — will be blocked by no-aschild-on-baseui hook
<SheetTrigger asChild><Button>Menu</Button></SheetTrigger>

// ✅ RIGHT
<SheetTrigger render={<Button variant="ghost" size="icon" />}>
  <Menu className="h-4 w-4" />
</SheetTrigger>
```

For `DropdownMenuTrigger` that just needs styling (no wrapping component), pass className directly — it already renders as `<button>`:
```tsx
<DropdownMenuTrigger className="flex items-center gap-2 ...">...</DropdownMenuTrigger>
```

### 2. `DropdownMenuLabel` renders as `<div>` in this project
It has been patched. Do NOT wrap it in `<DropdownMenuGroup>`. Use it directly:
```tsx
<DropdownMenuContent align="end">
  <DropdownMenuLabel className="font-medium">Notifications</DropdownMenuLabel>
  <DropdownMenuSeparator />
  <DropdownMenuItem>...</DropdownMenuItem>
</DropdownMenuContent>
```

### 3. Use Tailwind v4 CSS-var utility classes
- Background: `bg-background`, `bg-card`, `bg-popover`, `bg-muted`, `bg-accent`
- Foreground: `text-foreground`, `text-muted-foreground`, `text-accent-foreground`
- Border: `border-border`, `border-input`
- Radius: `rounded-[0.625rem]` for card corners, `rounded-md` for inputs
- Never use hex colors, never use `text-gray-500` etc. — only CSS-var tokens.

### 4. Command palette integration
If your module adds a shortcut, dispatch a `CustomEvent`:
```tsx
window.dispatchEvent(new CustomEvent('open-command-palette'))
```

### 5. Use `useTransition` for mutations
```tsx
const [pending, startTransition] = useTransition()
startTransition(async () => { await fetch(...); ... })
```

### 6. Patterns
- **List page**: `DataTable` + toolbar slot with search input + filter chips + "New" button
- **Create/Edit**: right-side `<Sheet side="right">` with RHF + Zod form
- **Detail page**: header Card + shadcn `<Tabs>` synced to `?tab=<id>` via `useSearchParams`
- **Empty state**: icon + "No things yet" + CTA button inside the DataTable `emptyMessage` slot
- **Sonner toasts**: `toast.success('Created')` on mutation success; `toast.error(err.message)` on failure

### 7. File layout

```
app/(dashboard)/<slug>/page.tsx                # list page
app/(dashboard)/<slug>/[id]/page.tsx           # detail page (if needed)
components/<slug>/<slug>-columns.tsx           # TanStack columns (client)
components/<slug>/<slug>-sheet.tsx             # create/edit Sheet (client)
components/<slug>/<slug>-filters.tsx           # filter chips (optional)
```

### 8. Data fetching
Use native `fetch` + `useState`/`useEffect` OR SWR if already installed. This project does not yet have SWR — prefer native fetch with `useSWR` only if `swr` is in `package.json`. Otherwise:

```tsx
const [rows, setRows] = useState<T[]>([])
const [total, setTotal] = useState(0)
const [isLoading, setIsLoading] = useState(false)

async function load() {
  setIsLoading(true)
  const res = await fetch(`/api/<slug>?${qs}`)
  const json = await res.json()
  if (res.ok) { setRows(json.data); setTotal(json.meta?.total ?? 0) }
  setIsLoading(false)
}
useEffect(() => { load() }, [page, limit, search, ...filters])
```

## Hard rules

1. Reuse `components/data-table/DataTable.tsx` — do NOT reimplement pagination or column visibility.
2. `'use client'` at the top of every page that uses hooks or forms.
3. Never use `asChild` — the hook will block you.
4. Never use hex colors — only Tailwind CSS-var tokens.
5. Every mutation uses `useTransition` + sonner toast.
6. Every form uses RHF + Zod + the shadcn `Form` primitives.
7. Row actions use `DropdownMenu` with `render` prop on the trigger.
8. Detail page tabs must sync to `?tab=...` searchParam, not client-only state.

## Workflow

1. Read the spec.
2. Check what exists under `app/(dashboard)/<slug>/`. If `mode === 'skip'` and the page exists, stop and print `– UI exists: skipping app/(dashboard)/<slug>/page.tsx`.
3. Build the columns file, sheet file, then page file. Detail page last if the spec calls for one.
4. Print a summary: `✓ UI: <list of files created>`.

## Do not

- Do not install new npm packages. Use what's already in package.json.
- Do not import from `@radix-ui/*` for Sheet/Dialog/DropdownMenu/Command — use the project's shadcn wrappers.
- Do not inline styles. Use Tailwind utility classes.
- Do not hand-roll tables. Always use `DataTable`.
- Do not add routes to `components/shell/Sidebar.tsx` unless the spec explicitly requests a sidebar entry (the master skill handles this in its consolidation step).
