import type { Metadata } from "next";
import { requirePermissionPage } from "@/lib/auth/guards";
import { getActiveContext } from "@/lib/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ExpenseForm } from "./expense-form";

export const metadata: Metadata = { title: "Record Expense" };

export default async function NewExpensePage() {
  await requirePermissionPage("expenses.create");
  const ctx = await getActiveContext();
  const admin = createAdminClient();
  if (!ctx.branchId) return <div><PageHeader title="Record Expense" /><EmptyState title="No active branch" /></div>;

  const [{ data: categories }, { data: suppliers }, { data: taxCodes }, { data: accounts }] = await Promise.all([
    admin.from("expense_categories").select("id, code, name").eq("company_id", ctx.companyId).eq("is_active", true).order("code"),
    admin.from("suppliers").select("id, code, name").eq("company_id", ctx.companyId).eq("is_active", true).order("code"),
    admin.from("tax_codes").select("id, name, rate, is_inclusive").eq("company_id", ctx.companyId).eq("is_active", true).order("code"),
    admin.from("payment_accounts").select("id, name, branch_id").eq("company_id", ctx.companyId).eq("is_active", true).order("code"),
  ]);
  const branchAccounts = (accounts ?? []).filter((a) => !a.branch_id || a.branch_id === ctx.branchId);

  return (
    <div>
      <PageHeader title="Record Expense" description="Operating expenses. Do not use this for inventory purchases." />
      <ExpenseForm branchId={ctx.branchId} categories={(categories ?? []) as never} suppliers={(suppliers ?? []) as never}
        taxCodes={(taxCodes ?? []).map((t) => ({ ...t, rate: Number(t.rate) })) as never} accounts={branchAccounts as never} />
    </div>
  );
}
