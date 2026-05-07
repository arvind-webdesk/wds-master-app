---
name: ui-table-page
description: Creates only the UI pages for a module — list page using DataTable, create/edit page (or Dialog if ≤3 fields), and detail page with Tabs. Delegates to ui-dashboard-builder. Use when the API already exists but you need to (re)generate the UI. NEVER produces Sheets/Drawers for record CRUD.
---

# /ui-table-page <slug> — UI-only scaffold

Builds list + detail pages under `app/(dashboard)/<slug>/` and shared form component under `components/<slug>/`.

## Mandatory layout

This skill MUST follow [record-form-layout](../record-form-layout/SKILL.md):

| Form size | Surface generated |
|---|---|
| 4+ fields, or rich UI (file upload, JSON editor, multi-section, dynamic lists, multi-step) | `app/(dashboard)/<slug>/new/page.tsx` + `app/(dashboard)/<slug>/[id]/edit/page.tsx` + shared `components/<slug>/<slug>-form.tsx` |
| ≤3 simple fields | `components/<slug>/<slug>-dialog.tsx` (opened from the list page) |

**Never generate `components/<slug>/<slug>-sheet.tsx`.** That pattern is retired. If `ui-dashboard-builder` outputs a sheet, reject the output and re-run with explicit "use a Page (or Dialog if ≤3 fields), not a Sheet" guidance.

The list page wires create/edit as navigations:

```tsx
// Create — Link, not a useState toggle
<Button asChild>
  <Link href="/<slug>/new"><Plus /> New {thing}</Link>
</Button>

// Edit — router.push to /edit
function handleEdit(row) { router.push(`/<slug>/${row.id}/edit`) }
```

For Dialog modules, `useState(open)` lives on the list page only and is fine — Dialog matches the form's lifecycle.

## Pre-flight

1. Verify `docs/modules/<slug>/spec.md` exists. If missing, invoke `module-architect` first.
2. Verify the API routes exist (`app/api/<slug>/route.ts`). If missing, tell the user: `API is missing — run \`/api-routes <slug>\` first, then retry.` and stop.
3. Read the spec to count visible form fields (excluding hidden/derived fields like timestamps and auto-derived slugs). This determines Page vs Dialog.
4. Check if `app/(dashboard)/<slug>/page.tsx` exists:
   - Exists → ask skip/overwrite (default skip).
   - Missing → proceed in `mode: 'build'`.

## Workflow

1. Invoke `ui-dashboard-builder` agent with: slug, mode, and `formSurface: 'page' | 'dialog'` decided in pre-flight.
2. Verify the output: must NOT contain any `import { Sheet, ... } from '@/components/ui/sheet'` in the generated files for this module.
3. Report files created.

## Post-scaffold

Remind the user:
- `pnpm dev` + visit `/<slug>` to sanity-check the list, create, edit, and detail flows.
- For Page-form modules: visit `/<slug>/new` and `/<slug>/<id>/edit` directly to confirm both pages render.
- The Sidebar does NOT auto-update — if this module needs a sidebar entry, add it manually in `components/shell/Sidebar.tsx`.

## Stack reminders (the agent already knows these)

- Forms must follow [form-validation](../form-validation/SKILL.md) — server errors via `applyServerErrors`, root error alert, every `FormField` has `<FormMessage />`, `<form noValidate>`, `autoComplete` on inputs.
- No `asChild` on Sheet/Dialog/DropdownMenu/Command — use `render` prop (Base UI, not Radix).
- Use `DropdownMenuLabel` directly (renders as `<div>` in this project, no `DropdownMenuGroup` wrapper).
- Tailwind v4 CSS-var tokens only — no hex colors.

## Non-goals

Does not touch API routes, DB schema, or CASL wiring.
