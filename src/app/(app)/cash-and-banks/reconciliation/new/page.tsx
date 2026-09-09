import type { Metadata } from "next";
import { requirePermissionPage } from "@/lib/auth/guards";
import { getActiveContext } from "@/lib/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui/page-header";
import { NewRecForm } from "./new-rec-form";

export const metadata: Metadata = { title: "New Reconciliation" };

export default async function NewReconciliationPage() {
  await requirePermissionPage("reconciliation.create");
  const ctx = await getActiveContext();
  const admin = createAdminClient();
  const { data: accounts } = await admin.from("payment_accounts").select("id, name").eq("company_id", ctx.companyId).eq("is_active", true).order("code");
  return (
    <div>
      <PageHeader title="New Bank Reconciliation" description="Enter the statement period and balances, then import statement lines." />
      <NewRecForm accounts={(accounts ?? []) as never} />
    </div>
  );
}
