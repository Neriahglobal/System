import type { Metadata } from "next";
import { requirePermissionPage } from "@/lib/auth/guards";
import { getActiveContext } from "@/lib/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { IncomeForm } from "./income-form";

export const metadata: Metadata = { title: "Record Other Income" };

export default async function NewIncomePage() {
  await requirePermissionPage("other_income.create");
  const ctx = await getActiveContext();
  const admin = createAdminClient();
  if (!ctx.branchId) return <div><PageHeader title="Record Other Income" /><EmptyState title="No active branch" /></div>;
  const [{ data: types }, { data: taxCodes }, { data: accounts }] = await Promise.all([
    admin.from("other_income_types").select("id, code, name").eq("company_id", ctx.companyId).eq("is_active", true).order("code"),
    admin.from("tax_codes").select("id, name, rate, is_inclusive").eq("company_id", ctx.companyId).eq("is_active", true).order("code"),
    admin.from("payment_accounts").select("id, name, branch_id").eq("company_id", ctx.companyId).eq("is_active", true).order("code"),
  ]);
  const branchAccounts = (accounts ?? []).filter((a) => !a.branch_id || a.branch_id === ctx.branchId);
  return (
    <div>
      <PageHeader title="Record Other Income" description="Non-sales income, fully received when posted." />
      <IncomeForm branchId={ctx.branchId} types={(types ?? []) as never} taxCodes={(taxCodes ?? []).map((t) => ({ ...t, rate: Number(t.rate) })) as never} accounts={branchAccounts as never} />
    </div>
  );
}
