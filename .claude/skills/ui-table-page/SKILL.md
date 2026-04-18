---
name: ui-table-page
description: Creates only the UI pages for a module — list page using DataTable, create/edit Sheet, and detail page with Tabs. Delegates to ui-dashboard-builder. Use when the API already exists but you need to (re)generate the UI.
---

# /ui-table-page <slug> — UI-only scaffold

Builds list + detail pages under `app/(dashboard)/<slug>/` and shared components under `components/<slug>/`.

## Pre-flight

1. Verify `docs/modules/<slug>/spec.md` exists. If missing, invoke `module-architect` first.
2. Verify the API routes exist (`app/api/<slug>/route.ts`). If missing, tell the user: `API is missing — run \`/api-routes <slug>\` first, then retry.` and stop.
3. Check if `app/(dashboard)/<slug>/page.tsx` exists:
   - Exists → ask skip/overwrite (default skip).
   - Missing → proceed in `mode: 'build'`.

## Workflow

1. Invoke `ui-dashboard-builder` agent with the slug + mode.
2. Report files created.

## Post-scaffold

Remind the user:
- `pnpm dev` + visit `/<slug>` to sanity-check the page.
- The Sidebar does NOT auto-update — if this module needs a sidebar entry, add it manually in `components/shell/Sidebar.tsx`.

## Stack reminders (the agent already knows these, but for your awareness)

- No `asChild` on Sheet/Dialog/DropdownMenu/Command — use `render` prop.
- Use `DropdownMenuLabel` directly (renders as `<div>` in this project, no `DropdownMenuGroup` wrapper).
- Tailwind v4 CSS-var tokens only — no hex colors.

## Non-goals

Does not touch API routes, DB schema, or CASL wiring.
