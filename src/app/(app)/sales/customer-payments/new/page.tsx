import type { Metadata } from "next";
import { requirePermissionPage } from "@/lib/auth/guards";
import { getActiveContext } from "@/lib/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ReceiptForm, type CustomerWithInvoices } from "./receipt-form";

export const metadata: Metadata = { title: "Receive Payment" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function NewReceiptPage(props: { searchParams: SP }) {
  await requirePermissionPage("sales.receive_payment");
  const ctx = await getActiveContext();
  const admin = createAdminClient();
  const sp = await props.searchParams;
  const initialCustomerId = typeof sp.customer === "string" ? sp.customer : undefined;
  const initialSaleId = typeof sp.sale === "string" ? sp.sale : undefined;

  if (!ctx.branchId) {
    return <div><PageHeader title="Receive Payment" /><EmptyState title="No active branch" /></div>;
  }

  // Outstanding posted invoices, grouped by customer.
  const { data: invoices } = await admin.from("sales")
    .select("id, document_number, document_date, outstanding, customer:customers(id, code, name)")
    .eq("company_id", ctx.companyId).eq("document_status", "posted").gt("outstanding", 0)
    .order("document_date");

  const map = new Map<string, CustomerWithInvoices>();
  for (const inv of invoices ?? []) {
    const c = (inv as unknown as { customer: { id: string; code: string; name: string } | null }).customer;
    if (!c) continue;
    if (!map.has(c.id)) map.set(c.id, { id: c.id, code: c.code, name: c.name, invoices: [] });
    map.get(c.id)!.invoices.push({
      id: (inv as { id: string }).id,
      document_number: (inv as { document_number: string | null }).document_number,
      document_date: (inv as { document_date: string }).document_date,
      outstanding: Number((inv as { outstanding: number }).outstanding),
    });
  }
  const customers = Array.from(map.values());

  const { data: accounts } = await admin.from("payment_accounts")
    .select("id, name, branch_id").eq("company_id", ctx.companyId).eq("is_active", true).order("code");
  const branchAccounts = (accounts ?? []).filter((a) => !a.branch_id || a.branch_id === ctx.branchId);

  return (
    <div>
      <PageHeader title="Receive Payment" description="Settle outstanding customer invoices." />
      <ReceiptForm branchId={ctx.branchId} customers={customers} accounts={branchAccounts as never}
        initialCustomerId={initialCustomerId} initialSaleId={initialSaleId} />
    </div>
  );
}
