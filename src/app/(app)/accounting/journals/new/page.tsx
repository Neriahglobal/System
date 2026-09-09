import type { Metadata } from "next";
import { requirePermissionPage } from "@/lib/auth/guards";
import { getActiveContext, can } from "@/lib/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui/page-header";
import { ManualJournalForm } from "./journal-form";

export const metadata: Metadata = { title: "Manual Journal" };

export default async function NewManualJournalPage() {
  await requirePermissionPage("accounting.create_manual_journal");
  const ctx = await getActiveContext();
  const admin = createAdminClient();
  const { data: accounts } = await admin.from("chart_of_accounts")
    .select("id, code, name, is_control").eq("company_id", ctx.companyId).eq("is_active", true).eq("allow_posting", true).order("code");
  return (
    <div>
      <PageHeader title="Manual Journal" description="Balanced double-entry journal. Control accounts are owned by their subledgers." />
      <ManualJournalForm accounts={(accounts ?? []) as never} canPost={can(ctx.user, "accounting.post_manual_journal")} canControl={can(ctx.user, "accounting.post_control_account_adjustment")} />
    </div>
  );
}
