# Neriah ERP

ERP and accounting system for **Neriah Global Group of Companies Limited**.

This repository implements **Phase 1 — System Foundation** (auth, RBAC, master data) and
**Phase 2 — Sales, Customer Payments, Inventory & Kardex**. Purchases, Expenses, Other
Income, Cash Transfers and full financial reports are intentionally **deferred to later
phases** and appear as locked items in the sidebar.

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
npm run typecheck        # tsc --noEmit
npm run test             # pure calculation unit tests (tax, weighted-average)
npm run test:integration # end-to-end posting test against the DB (BEGIN..ROLLBACK, no data kept)
npm run build            # production build (webpack on this machine)
npm run lint
```

---

# Phase 2 — Sales, Customer Payments, Inventory & Kardex

## Setup
Phase 2 adds migrations `0006`–`0012`. On an existing Phase 1 database:

```bash
npm run db:migrate   # applies 0006-0012 (idempotent)
npm run db:seed      # registers the new Phase 2 permissions & role grants
```

The seed adds fine-grained permissions (`sales.view_cost`, `sales.override_price`,
`sales.sell_below_cost`, `sales.receive_payment`, `sales.create_return`,
`inventory.view_cost`, `inventory.view_kardex`, `inventory.opening_balance`,
`inventory.adjustment_create/adjustment_post`, `inventory.transfer_create/dispatch/receive`)
and maps them to the default roles. `transactions.delete_draft` and `transactions.void`
remain Owner-only.

## Atomic posting (RPC functions)
Every posting operation runs inside **one PostgreSQL function** (a single transaction):
it locks stock and sequence rows, recalculates all totals on the server, writes stock,
kardex, journal, payment and status records together, and is guarded by an idempotency
key. Functions are `SECURITY DEFINER` with a fixed `search_path`, and `EXECUTE` is granted
only to `service_role` (called by trusted server actions after the user, permission and
branch access have been verified). Functions: `post_inventory_opening`, `post_stock_adjustment`,
`post_sale`, `post_customer_receipt`, `post_sales_return`, `dispatch_stock_transfer`,
`receive_stock_transfer`, and matching `void_*`, plus helpers `record_stock_movement`
(weighted-average costing), `next_document_number`, `create_journal`, `recalc_sale`.

## Inventory costing
**Weighted-average by (company, branch, product).** Incoming stock:
`new avg = (old value + qty×cost) / (old qty + qty)`. Outgoing uses the average *before*
the movement and stores that cost on the movement (COGS). The immutable `stock_movements`
ledger is the source of truth; `stock_balances` is a reconciling projection. Negative stock
is blocked; a sale cannot post without sufficient stock; non-`track_inventory` products
create no stock or COGS entries.

## Accounting entries
- **Sale:** Dr Cash/Bank/MoMo (received) + Dr A/R (unpaid); Cr Sales Revenue (net); Cr Output
  VAT (tax). Tracked lines also Dr COGS / Cr Inventory. Debits always equal credits.
- **Customer receipt:** Dr payment account; Cr A/R.
- **Sales return:** Dr Sales Returns (net) + Dr Output VAT reversal; Cr payment account / A/R.
  Saleable returns also Dr Inventory / Cr COGS at the original captured cost.
- **Opening balance:** Dr Inventory; Cr Opening Balance Equity.
- **Adjustment +:** Dr Inventory / Cr Inventory Adjustment Gain. **Adjustment −:** Dr Inventory
  Shrinkage / Cr Inventory. **Transfers** create no GL journal (ownership unchanged).

## Workflows
- **Opening stock:** Owner creates a draft, posts it → stock-in movements + balanced journal.
- **Sales:** create a draft (no stock/GL effect) → Post allocates the invoice number and does
  everything atomically. Payment status (unpaid / partial / paid / refunded) is server-computed.
- **Customer payments:** pick a customer, allocate the receipt across their outstanding invoices
  (allocations must equal the amount — no overpayment), Post settles the invoices.
- **Sales returns:** reference a posted sale; quantities capped at sold − prior returns; original
  price/tax/cost come from the sale line; saleable stock is restored at original cost.
- **Adjustments:** increase (needs cost) / decrease (uses current average); reason mandatory.
- **Transfers:** draft → dispatch (stock out of source, into transit) → receive (partial allowed).

## Voiding rules
Only the Owner can void posted documents. Voids require a reason, reverse stock and accounting,
keep the original visible, and never reuse a number. A sale cannot be voided while it has posted
receipts or returns — reverse those first. Posted documents and ledgers are never hard-deleted.

## Routes added
`/sales/new`, `/sales/history`, `/sales/[id]`, `/sales/[id]/return`, `/sales/customer-payments`,
`/sales/customer-payments/new`, `/inventory`, `/inventory/kardex`, `/inventory/opening-balances`,
`/inventory/adjustments`, `/inventory/transfers`, `/inventory/transfers/[id]`, plus printable
`/invoice/[id]` and `/receipt/[id]`.

## Tables added
`stock_balances`, `stock_movements`, `journal_entries`, `journal_lines`, `inventory_openings(+lines)`,
`stock_adjustments(+lines)`, `stock_transfers(+lines)`, `sales(+lines)`, `sale_payments`,
`customer_receipts(+allocations)`, `sales_returns(+lines,+refunds)`, `transaction_status_history`,
`idempotency_keys`. RLS is enabled and forced on all of them: reads are company-scoped, and there
are no client write policies (all mutations flow through service-role server actions).

## Testing
`npm run test` (calculation units) and `npm run test:integration` (posts an opening, sale, receipt
and return through the real RPCs and asserts stock, weighted-average cost, balanced journals,
duplicate-post and insufficient-stock rejection — all inside a transaction that rolls back).

## Phase 1 scope

**Included:** sign-in, dashboard (real setup stats), admin master data (company, branches,
products, categories, brands, units, tax codes, payment accounts, other-income types,
expense categories, customers, suppliers, chart of accounts, roles & permissions, users,
document numbering, accounting periods, audit log), unauthorized page, account/profile.

**Deferred to later phases:** Purchases, Expenses, Other Income, Cash Transfers, and full
financial reports. These appear as locked items in the sidebar and have no transaction pages.
(Sales, Customer Payments, Inventory and Kardex are delivered in Phase 2 — see below.)

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
