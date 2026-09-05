# Neriah ERP

ERP and accounting system for **Neriah Global Group of Companies Limited**.

This repository currently implements **Phase 1 — System Foundation**: authentication,
role-based access control, and administration of master data. Transactional modules
(Sales, Purchases, Expenses, Other Income, Cash Transfers, Inventory, Kardex and
accounting reports) are intentionally **deferred to later phases**.

- Base currency: **TZS** · Timezone: **Africa/Dar_es_Salaam** · Dates: **DD/MM/YYYY**
- Multi-company ready (starts with one company: `NERIAH`).

## Tech stack

- Next.js 16 (App Router) + React 19, TypeScript (strict)
- Tailwind CSS v4, hand-built shadcn-style UI on Radix primitives
- Supabase (PostgreSQL + Auth), Row Level Security
- React Hook Form–style forms with server-side Zod/validation
- Postgres migrations & seeds run with `pg` + `tsx`

> **Windows note:** this machine's native `@next/swc` binary is zeroed by antivirus
> ("not a valid Win32 application"). The `dev` and `build` scripts use `--webpack`,
> which runs fine on the WASM SWC fallback. On a clean machine you can remove
> `--webpack`. See `.claude` memory `flutter-sdk-corruption` for the repair steps.

---

## 1. Local setup

```bash
npm install
cp .env.example .env.local   # then fill in the values (see below)
```

### Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | Anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Full-access key; never sent to the browser |
| `DATABASE_URL` | scripts only | Direct Postgres connection for migrations/seed |
| `OWNER_EMAIL` | scripts | Email that becomes the protected Owner |
| `OWNER_INITIAL_PASSWORD` | scripts (optional) | Password used only if the Owner auth user must be created |
| `NEXT_PUBLIC_APP_NAME` / `NEXT_PUBLIC_COMPANY_NAME` | app | Display strings |

`.env.local` is git-ignored. Only `.env.example` (no secrets) is committed.

## 2. Supabase setup

1. Create / open the Supabase project.
2. Get the keys from **Project Settings → API** (`anon` and `service_role`).
3. Get `DATABASE_URL` from **Project Settings → Database → Connection string (URI)**
   (URL-encode special characters in the password).
4. Paste all four into `.env.local`.

## 3. Migrations

Migrations live in `supabase/migrations/*.sql` and are applied in order. They are
idempotent and tracked in a `schema_migrations` table.

```bash
npm run db:migrate
```

| File | Contents |
| --- | --- |
| `0001_foundation.sql` | Extensions, `updated_at` trigger, cross-company & COA triggers, auth helper functions |
| `0002_identity_rbac.sql` | `companies`, `branches`, `roles`, `permissions`, `role_permissions`, `user_profiles`, access tables |
| `0003_master_data.sql` | Units, categories, brands, chart of accounts, tax codes, payment accounts, products, customers, suppliers, expense/income types, document sequences, accounting periods |
| `0004_audit.sql` | Immutable `audit_logs` (update/delete blocked by triggers) |
| `0005_rls.sql` | Row Level Security policies for every table |

## 4. Seed

Idempotent — safe to run repeatedly.

```bash
npm run db:seed
```

Seeds: all permissions & the 6 default roles; company `NERIAH`; branch `HQ` (head office);
units (Piece, Litre, Kilogram, Bag, Carton); a hierarchical chart of accounts; tax codes
(VAT 18%, Zero, Exempt); payment accounts (Cash, NMB, CRDB, MIX, M-Pesa); the protected
`WALK-IN` customer; document-number sequences; and the current-year accounting period.

## 5. Owner bootstrap

```bash
npm run bootstrap:owner
```

Finds (or creates, using `OWNER_INITIAL_PASSWORD`) the auth user for `OWNER_EMAIL`, then
gives them the protected **Owner** role, company/branch access and `is_primary_owner`.
Run **after** migrate + seed. The primary Owner cannot be deleted, deactivated or downgraded.

Full first-time sequence:

```bash
npm run db:migrate
npm run db:seed
npm run bootstrap:owner
```

## 6. Run

```bash
npm run dev            # http://localhost:3000
# or
npm run build && npm run start
```

Sign in at `/sign-in` with the Owner email and password.

## 7. User invitation process

There is **no public sign-up**. The Owner creates users under **Admin → Users**:
set email, name, initial password, role (the Owner role cannot be assigned here),
companies, branches and default branch. Users can change their own password under
**My Account**, and the Owner can trigger a password-reset email. Inactive users
cannot sign in.

## 8. Permission model

- **Roles** (`roles`) ↔ **permissions** (`permissions`, `resource.action`) via
  `role_permissions`. Each user has one role (`user_profiles.role_id`) plus explicit
  company access (`user_company_access`) and branch access (`user_branch_access`).
- Resources are scaffolded for every planned module; Phase 1 enforces Admin, Users,
  Roles and Audit-log permissions (Owner-only). Future Owner-only permissions
  `transactions.delete_draft` and `transactions.void` are seeded. There is **no**
  "delete posted transaction" permission.
- Server helpers in `src/lib/auth/guards.ts`: `requireUser`, `requireActiveUser`,
  `requireOwnerPage`, `requirePermissionPage` (redirecting page guards) and
  `assertActiveUser`, `assertOwner`, `assertCompanyAccess`, `assertBranchAccess`,
  `assertPermission` (throwing guards for server actions).

## 9. Row Level Security

RLS is enabled and **forced** on every table:

- Company-scoped tables: readable when the user has access to the row's company
  (`has_company_access`, Owner sees all); insert/update/delete **Owner-only**.
- `roles`/`permissions`/`role_permissions`: readable by any authenticated user; writes Owner-only.
- `user_profiles` and access tables: a user reads their own rows; Owner reads/writes all.
- `audit_logs`: Owner-only read; no write policy (only the service role inserts) and
  update/delete are blocked by triggers even for the service role.

Server actions re-verify identity and Owner authorization in code, and use the
trusted server identity for `created_by`/`updated_by` and `company_id` — browser-supplied
role/company/branch ids are never trusted.

## 10. Test & build commands

```bash
npm run typecheck      # tsc --noEmit
npm run build          # production build (webpack on this machine)
npm run lint
```

## Phase 1 scope

**Included:** sign-in, dashboard (real setup stats), admin master data (company, branches,
products, categories, brands, units, tax codes, payment accounts, other-income types,
expense categories, customers, suppliers, chart of accounts, roles & permissions, users,
document numbering, accounting periods, audit log), unauthorized page, account/profile.

**Deferred to later phases:** Sales, Purchases, Expenses, Other Income, Cash Transfers,
Inventory movements, Kardex, and accounting reports. These appear as locked items in the
sidebar and have no transaction pages.

## Project structure

```
src/
  app/
    (auth)/sign-in/           # sign-in page + action
    (app)/                    # protected shell (sidebar/header/branch selector)
      dashboard/              # setup dashboard
      admin/                  # Owner-only admin
        [resource]/           # generic master-data CRUD (14 entities)
        company/ users/ roles/ audit-log/   # bespoke admin pages
      account/                # profile & password
    unauthorized/             # access-denied page
  components/{ui,layout,admin} # design system + shell + CRUD engine
  lib/
    supabase/                 # browser / server / admin clients + middleware
    auth/                     # session, guards, permissions catalog, actions
    admin/                    # resource registry, queries, server actions
    audit.ts format.ts utils.ts
scripts/                      # migrate / seed / bootstrap-owner
supabase/migrations/          # SQL migrations
```
