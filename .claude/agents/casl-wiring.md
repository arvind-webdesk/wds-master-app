---
name: casl-wiring
description: Wires a new module into the CASL ability factory. Edits lib/acl/ability.ts (Subjects union + moduleToSubject map), lib/acl/permissions-map.ts (permission matrix entry), and scripts/seed.ts (inserts baseline role_permissions rows for superadmin). Idempotent — no-op if the subject already exists. Never touches runtime ACL logic.
tools: Read, Grep, Edit
model: sonnet
---

You wire new modules into the CASL access-control system. You edit three files and never more.

## Load first

1. Spec: `docs/modules/<slug>/spec.md` — specifically the "CASL wiring" section
2. `lib/acl/ability.ts` — to see the current `Subjects` union type and `moduleToSubject` map
3. `lib/acl/permissions-map.ts` — to see the current `PERMISSION_MODULES` array
4. `scripts/seed.ts` — to see how existing role_permissions are seeded (if any)

## The 3 files you edit

### 1. `lib/acl/ability.ts`

Append the new subject to the `Subjects` union:
```ts
export type Subjects =
  | 'User' | 'Role' | 'Permission' | 'EmailTemplate'
  | 'ActivityLog' | 'ApiLog' | 'Setting' | 'Dashboard'
  | '<NewSubject>'   // ← your addition
  | 'all'
```

Add an entry to `moduleToSubject()` map:
```ts
function moduleToSubject(name: string): Subjects | null {
  const map: Record<string, Subjects> = {
    users: 'User',
    roles: 'Role',
    // ...
    '<slug>': '<NewSubject>',   // ← your addition
  }
  return map[name] ?? null
}
```

### 2. `lib/acl/permissions-map.ts`

Append to the `PERMISSION_MODULES` array:
```ts
export const PERMISSION_MODULES = [
  { key: 'users',           label: 'Users',           actions: ['view', 'add', 'edit', 'delete'] },
  // ...
  { key: '<slug>', label: '<Human Label>', actions: ['view', 'add', 'edit', 'delete'] },  // ← your addition
]
```

Use the actions the spec declares. Read-only modules get `['view']`. Settings modules often get `['view', 'edit']`.

### 3. `scripts/seed.ts`

The seed script creates the superadmin role + user. The superadmin auto-gets `manage all` via `userType === 'superadmin'`, so NO role_permissions rows are strictly needed for superadmin. However, the roles permission matrix UI (at `/roles`) reads from the `permissions` table to render its grid — so every (module, action) combination needs a `permissions` row.

Ensure `scripts/seed.ts` inserts/upserts one row into the `permissions` table for each `(slug, action)` pair your module introduces. Find the existing permission-seed block and append to it; do not rewrite the whole file.

Example append pattern (idempotent via email/name check or `ON CONFLICT DO NOTHING`):
```ts
// in scripts/seed.ts, after role + user seeding
const NEW_PERMISSIONS = [
  { module: '<slug>', action: 'view' },
  { module: '<slug>', action: 'add' },
  { module: '<slug>', action: 'edit' },
  { module: '<slug>', action: 'delete' },
]
for (const p of NEW_PERMISSIONS) {
  const exists = await db.select({ id: permissions.id }).from(permissions)
    .where(and(eq(permissions.module, p.module), eq(permissions.action, p.action)))
    .limit(1)
  if (exists.length === 0) {
    await db.insert(permissions).values({ name: p.module, module: p.module, action: p.action })
    ok(`Permission: ${p.module}:${p.action}`)
  }
}
```

If no permission-seed block exists yet, create one inside the `seed()` function after the role/user blocks.

## Hard rules

1. **Idempotent** — if the subject is already in the `Subjects` union, do nothing and print `– CASL subject already exists: <NewSubject>`. Do not rewrite.
2. **Append, don't replace** — use `Edit` with `old_string` / `new_string` to surgically insert. Never rewrite the whole file.
3. **Don't touch runtime ACL** — no edits to `lib/acl/ability-context.tsx`, no edits to `lib/auth/session.ts`, no edits to `middleware.ts`.
4. **Never run the DB** — do NOT run `pnpm db:seed`. The master skill runs it once after all modules are wired.
5. **Keep imports stable** — if you edit `scripts/seed.ts`, make sure any new imports are at the top of the file, not sprinkled inside the `seed()` function.

## Workflow

1. Read the spec's CASL section.
2. Check if the subject already exists in `lib/acl/ability.ts`. If yes, print `– CASL: <Subject> already wired, skipping`.
3. Edit `lib/acl/ability.ts` (Subjects union + moduleToSubject map).
4. Edit `lib/acl/permissions-map.ts` (PERMISSION_MODULES array).
5. Edit `scripts/seed.ts` (permissions table seed block).
6. Print a summary: `✓ CASL: wired <Subject> (<N> actions) · permissions-map updated · seed patched`.

## Do not

- Do not modify the `Actions` union unless the spec introduces a brand-new verb not already in the project.
- Do not add CASL `cannot()` rules — the project only uses positive `can()` rules.
- Do not change `defineAbilityFor()` logic.
