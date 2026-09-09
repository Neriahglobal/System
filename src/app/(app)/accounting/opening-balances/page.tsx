import type { Metadata } from "next";
import { requirePermissionPage } from "@/lib/auth/guards";
import { getActiveContext } from "@/lib/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { OpeningTabs } from "./opening-tabs";

export const metadata: Metadata = { title: "General Opening Balances" };

export default async function AccountingOpeningsPage() {
  await requirePermissionPage("accounting.manage_opening_balances");
  const ctx = await getActiveContext();
  const admin = createAdminClient();
  if (!ctx.branchId) return <div><PageHeader title="General Opening Balances" /><EmptyState title="No active branch" /></div>;
  const [{ data: accounts }, { data: customers }, { data: suppliers }] = await Promise.all([
    admin.from("chart_of_accounts").select("id, code, name").eq("company_id", ctx.companyId).eq("is_active", true).eq("allow_posting", true).eq("is_control", false).order("code"),
    admin.from("customers").select("id, code, name").eq("company_id", ctx.companyId).eq("is_active", true).order("code"),
    admin.from("suppliers").select("id, code, name").eq("company_id", ctx.companyId).eq("is_active", true).order("code"),
  ]);
  return (
    <div>
      <PageHeader title="General Opening Balances" description="Opening balances not handled by inventory or payment-account openings. Owner only." />
      <OpeningTabs accounts={(accounts ?? []) as never} customers={(customers ?? []) as never} suppliers={(suppliers ?? []) as never} branchId={ctx.branchId} />
    </div>
  );
}
