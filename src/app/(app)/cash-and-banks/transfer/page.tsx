import type { Metadata } from "next";
import { requirePermissionPage } from "@/lib/auth/guards";
import { getActiveContext } from "@/lib/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui/page-header";
import { TransferForm } from "./transfer-form";

export const metadata: Metadata = { title: "Cash Transfer" };

export default async function CashTransferPage() {
  await requirePermissionPage("cash_transfers.create");
  const ctx = await getActiveContext();
  const admin = createAdminClient();
  const { data: accounts } = await admin.from("payment_accounts").select("id, name").eq("company_id", ctx.companyId).eq("is_active", true).order("code");
  return (
    <div>
      <PageHeader title="Cash Transfer" description="Move money between accounts. This is not income or an ordinary expense." />
      <TransferForm accounts={(accounts ?? []) as never} branchId={ctx.branchId} />
    </div>
  );
}
