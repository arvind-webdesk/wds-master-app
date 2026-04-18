---
name: api-routes
description: Creates only the API route handlers for a module. Reads docs/modules/<slug>/spec.md and delegates to api-route-builder. Use when the schema exists but you need to (re)generate the routes without touching UI or CASL.
---

# /api-routes <slug> — API-only scaffold

Creates `app/api/<slug>/route.ts` + `app/api/<slug>/[id]/route.ts` (+ any sub-routes the spec declares) for an existing module.

## Pre-flight

1. Verify `docs/modules/<slug>/spec.md` exists. If missing, invoke `module-architect` first to produce it.
2. Verify `lib/db/schema/<slug>.ts` exists. If missing, tell the user: `Schema is missing — run \`/db-design <slug>\` first, then retry.` and stop.
3. Check if `app/api/<slug>/route.ts` exists:
   - Exists → ask skip/overwrite (default skip).
   - Missing → proceed in `mode: 'build'`.

## Workflow

1. Invoke `api-route-builder` agent with the slug + mode.
2. Report the files that were created.

## Post-scaffold

Remind the user to exercise each route with curl or the browser:
```
GET  /api/<slug>              (list, requires read permission)
POST /api/<slug>              (create, requires create permission)
GET  /api/<slug>/[id]         (detail)
PATCH /api/<slug>/[id]        (update)
DELETE /api/<slug>/[id]       (soft delete)
```

## Non-goals

Does not touch UI, DB schema, or CASL. Use `/ui-table-page`, `/db-design`, `/casl-permissions` respectively.
