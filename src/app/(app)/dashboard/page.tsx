import type { Metadata } from "next";
import Link from "next/link";
import {
  Building,
  Package,
  Users2,
  Truck,
  Wallet,
  UserCog,
  CheckCircle2,
  Circle,
  ArrowRight,
} from "lucide-react";
import { requireActiveUser } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPrimaryCompanyId } from "@/lib/admin/queries";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Dashboard" };

async function count(
  admin: ReturnType<typeof createAdminClient>,
  table: string,
  companyId: string,
  activeOnly = false,
) {
  let q = admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);
  if (activeOnly) q = q.eq("is_active", true);
  const { count } = await q;
  return count ?? 0;
}

export default async function DashboardPage() {
  const user = await requireActiveUser();
  const admin = createAdminClient();
  const companyId = await getPrimaryCompanyId(user.defaultCompanyId);

  const { data: company } = await admin
    .from("companies")
    .select("name")
    .eq("id", companyId)
    .maybeSingle();

  const [
    branches,
    products,
    customers,
    suppliers,
    paymentAccounts,
    users,
    categories,
    taxCodes,
    accounts,
  ] = await Promise.all([
    count(admin, "branches", companyId, true),
    count(admin, "products", companyId, true),
    count(admin, "customers", companyId),
    count(admin, "suppliers", companyId),
    count(admin, "payment_accounts", companyId, true),
    admin
      .from("user_profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .then((r) => r.count ?? 0),
    count(admin, "product_categories", companyId, true),
    count(admin, "tax_codes", companyId, true),
    count(admin, "chart_of_accounts", companyId, true),
  ]);

  const stats = [
    { label: "Active Branches", value: branches, icon: Building, href: "/admin/branches" },
    { label: "Active Products", value: products, icon: Package, href: "/admin/products" },
    { label: "Customers", value: customers, icon: Users2, href: "/admin/customers" },
    { label: "Suppliers", value: suppliers, icon: Truck, href: "/admin/suppliers" },
    { label: "Payment Accounts", value: paymentAccounts, icon: Wallet, href: "/admin/payment-accounts" },
    { label: "Active Users", value: users, icon: UserCog, href: "/admin/users" },
  ];

  const checklist = [
    { label: "Company profile created", done: !!company, href: "/admin/company" },
    { label: "At least one branch", done: branches > 0, href: "/admin/branches" },
    { label: "Chart of accounts set up", done: accounts > 0, href: "/admin/chart-of-accounts" },
    { label: "Payment accounts added", done: paymentAccounts > 0, href: "/admin/payment-accounts" },
    { label: "Tax codes configured", done: taxCodes > 0, href: "/admin/tax-codes" },
    { label: "Product categories added", done: categories > 0, href: "/admin/product-categories" },
    { label: "Products added", done: products > 0, href: "/admin/products" },
    { label: "Users invited", done: users > 1, href: "/admin/users" },
  ];
  const completed = checklist.filter((c) => c.done).length;

  return (
    <div>
      <PageHeader
        title={`Welcome${user.fullName ? `, ${user.fullName.split(" ")[0]}` : ""}`}
        description={company?.name ?? "Neriah ERP"}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.label} href={s.href}>
              <Card className="p-4 transition-colors hover:border-primary/40">
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-[18px] w-[18px]" />
                </div>
                <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Setup checklist</h2>
              <span className="text-xs text-muted-foreground">
                {completed} of {checklist.length} complete
              </span>
            </div>
            <div className="mb-4 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(completed / checklist.length) * 100}%` }}
              />
            </div>
            <ul className="space-y-1">
              {checklist.map((c) => (
                <li key={c.label}>
                  <Link
                    href={c.href}
                    className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                  >
                    {c.done ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground/50" />
                    )}
                    <span className={c.done ? "text-foreground" : "text-muted-foreground"}>
                      {c.label}
                    </span>
                    {!c.done && (
                      <ArrowRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Phase 1 scope</h2>
            <p className="text-sm text-muted-foreground">
              This is the foundation release: authentication, role-based access
              and administration of master data. Sales, purchases, expenses,
              inventory and accounting reports are intentionally deferred to
              later phases and are shown as locked in the sidebar.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
