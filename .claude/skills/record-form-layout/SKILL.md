---
name: record-form-layout
description: Project standard for where record create/edit forms live. Use whenever you build, modify, scaffold, or review a CRUD UI for any module (users, roles, settings, email-templates, connections, cron-sync, dashboard-setup, or any module added later). Forbids Sheets/Drawers for record CRUD. Triggers on "create form", "edit form", "new record", "sheet", "drawer", "dialog", "modal", "scaffold module", or any new file under app/(dashboard)/**/page.tsx, components/**/*-sheet.tsx, components/**/*-form.tsx.
---

# Record form layout — project standard

Where the create/edit form for a record lives in the UI is a project-wide UX choice — not a per-module decision. This skill locks that choice in so every module looks and behaves the same.

## The rule

| Form size | Surface | Route shape |
|---|---|---|
| **4 or more visible fields, or any rich UI** (file upload, JSON editor, multi-section, dynamic lists, multi-step) | **Dedicated page** | `/<module>/new` and `/<module>/[id]/edit` |
| **3 or fewer simple fields** (text/select/checkbox only) | **Dialog (modal)** | Stays on the list page; opens over it |
| Anything | **NEVER a Sheet/Drawer** | — |

"Visible fields" excludes hidden/derived ones (slug auto-derived from name, timestamps). If you're on the borderline (4 fields where one is a single checkbox), pick Dialog. If a field is itself complex (long textarea, code editor, file picker), bump to Page even at 2-3 total fields.

A multi-step wizard is always a Page even if each step has fewer fields.

## Why these specifically

- **Pages** for big forms — the user can deep-link, hit Back to cancel, autofocus the first field, see browser autofill, scroll without fighting an inner-scroll container, and read the URL to know what they're editing. Pages also work on mobile by default; sheets become unusable.
- **Dialogs** for tiny forms — 1-3 fields and you don't want to hide the surrounding context. Setting one config key, confirming a destructive action with extra fields, quick rename — these belong in a modal.
- **Sheets/Drawers are out** — they tie the form's lifetime to a stateful parent, lose state on accidental backdrop click, fight the existing list table for scroll, are awkward on mobile, and can't be deep-linked. Every sheet we've shipped has accumulated this list of bugs.

## Forbidden patterns

```tsx
// ❌ Don't do this — anywhere
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'

<Sheet open={open} onOpenChange={setOpen}>
  <SheetContent side="right">
    <SheetHeader>...</SheetHeader>
    <form>...</form>
  </SheetContent>
</Sheet>
```

`Sheet` is still fine for **non-record** UI: a filter panel, the mobile sidebar, a side preview pane. Just not for a form that creates or edits a row.

## Required patterns

### Page form (standard case)

`app/(dashboard)/<module>/new/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/session'
import { defineAbilityFor } from '@/lib/acl/ability'
import { ModuleForm } from '@/components/<module>/module-form'

export const metadata = { title: 'New <thing>' }

export default async function NewPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const ability = defineAbilityFor(user)
  if (!ability.can('create', '<Subject>')) redirect('/<module>')

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">New <thing></h1>
      <ModuleForm mode="create" />
    </div>
  )
}
```

`app/(dashboard)/<module>/[id]/edit/page.tsx`:

```tsx
import { redirect, notFound } from 'next/navigation'
// ...same auth pattern...
import { ModuleForm } from '@/components/<module>/module-form'

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // load row server-side, 404 if missing
  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Edit <thing></h1>
      <ModuleForm mode="edit" initialValues={row} />
    </div>
  )
}
```

The shared `<ModuleForm />` component:
- Lives at `components/<module>/<module>-form.tsx` (NOT `*-sheet.tsx`).
- Takes `mode: 'create' | 'edit'` and optional `initialValues`.
- On submit success, calls `router.push('/<module>')` (after a success toast) — back to the list.
- Cancel button: `<Link href="/<module>">Cancel</Link>` — never a JavaScript navigation.
- Follows [form-validation](../form-validation/SKILL.md) for server error handling.

### List page — link, not modal trigger

```tsx
// On the list page, opening "New" is a navigation, not a state toggle.
<Button asChild>
  <Link href="/<module>/new">
    <Plus className="h-4 w-4" />
    New <thing>
  </Link>
</Button>

// Edit row → push to /edit page
<Link href={`/${moduleSlug}/${row.id}/edit`}>Edit</Link>
```

No `useState(open, setOpen)` for record forms. Delete those state hooks and the conditional render of the sheet — there's nothing to manage when the form is its own page.

### Dialog form (small case)

`components/<module>/<module>-dialog.tsx`:

```tsx
'use client'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { applyServerErrors, parseFetchError } from '@/lib/form-errors'

export function ModuleDialog({ open, onOpenChange, row, onSuccess }: Props) {
  const isEdit = Boolean(row)
  // form, onSubmit, etc.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit X' : 'New X'}</DialogTitle>
          <DialogDescription>...</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            {/* ≤3 fields */}
          </form>
        </Form>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button type="submit" form={formId}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

Dialog is fine because the form's "container" lifecycle matches the form's lifecycle — and 1-3 fields fit comfortably without scrolling.

### Detail page — Edit goes to `/edit`, not opens a sheet

```tsx
// On /[id] detail page
<Button asChild>
  <Link href={`/<module>/${id}/edit`}>Edit</Link>
</Button>
```

No `setSheetOpen(true)` on the detail page either.

## Module checklist (before shipping any CRUD module)

- [ ] Create form lives at `/<module>/new/page.tsx` (or in a Dialog if ≤3 fields)
- [ ] Edit form lives at `/<module>/[id]/edit/page.tsx` (or in the same Dialog, opened with `row` populated)
- [ ] Shared form component named `*-form.tsx` (NOT `*-sheet.tsx`)
- [ ] List page's "New" button is `<Link href="/<module>/new">`, not a `useState` toggle
- [ ] Detail page's "Edit" button is `<Link href="/<module>/[id]/edit">`, not a sheet trigger
- [ ] Cancel = `<Link>` back to list; success = `router.push('/<module>')` after toast
- [ ] No `import { Sheet, SheetContent, ... } from '@/components/ui/sheet'` for this module
- [ ] Follows [form-validation](../form-validation/SKILL.md) for error display

## Reference implementation (in the repo)

- **Dialog form (3 fields):** [components/settings/settings-dialog.tsx](../../../components/settings/settings-dialog.tsx) — key/value config. 2 inputs + 1 textarea, dialog is the right surface.
- **Page form (many fields):** [app/(dashboard)/settings/dashboard-setup/page.tsx](../../../app/(dashboard)/settings/dashboard-setup/page.tsx) — multi-step wizard, definitely a page.

(More page-form references will land as the existing `*-sheet.tsx` modules are migrated.)

## Migrating an existing `*-sheet.tsx` to a page

1. Extract the form body (everything inside `<SheetContent>`) into `components/<module>/<module>-form.tsx`. Component takes `mode` + `initialValues` props.
2. Create `app/(dashboard)/<module>/new/page.tsx` rendering `<ModuleForm mode="create" />`.
3. Create `app/(dashboard)/<module>/[id]/edit/page.tsx` — server-side fetch row, render `<ModuleForm mode="edit" initialValues={row} />`.
4. List page: replace `useState(sheetOpen)` + `<ModuleSheet ... />` with `<Link href="/<module>/new">`. Replace edit handler with `router.push(\`/<module>/\${row.id}/edit\`)`.
5. Detail page (if it has an Edit button): same — replace with `<Link href="/<module>/[id]/edit">`.
6. Delete the old `<module>-sheet.tsx` file and its imports.
7. Update CASL gates if needed (the Edit page must check the same `update <Subject>` ability).

## Common bugs this skill prevents

| Symptom | Root cause |
|---|---|
| "Form data lost when I click outside the panel" | Sheet — backdrop click closes it. Pages don't do this. |
| "Can't share the edit URL with a teammate" | Sheet — state lives in the parent component. |
| "Mobile is unusable" | Sheet — drawer overlaps the keyboard. |
| "Browser back button does the wrong thing" | Sheet — closing a sheet isn't a navigation. |
| "Inner scroll fights the list page scroll" | Sheet — both have their own scroll containers. |
| "Refreshing the page kicks me out of the form" | Sheet — open state isn't in the URL. |
