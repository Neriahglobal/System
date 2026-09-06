import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermissionPage } from "@/lib/auth/guards";
import { getActiveContext } from "@/lib/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui/page-header";
import { ReturnForm, type RLine } from "./return-form";

export const metadata: Metadata = { title: "Sales Return" };
type Params = Promise<{ id: string }>;

export default async function ReturnPage(props: { params: Params }) {
  await requirePermissionPage("sales.create_return");
  const ctx = await getActiveContext();
  const { id } = await props.params;
  const admin = createAdminClient();

  const { data: sale } = await admin.from("sales").select("id, company_id, branch_id, document_number, document_status").eq("id", id).maybeSingle();
  if (!sale || sale.company_id !== ctx.companyId || sale.document_status !== "posted") notFound();

  const { data: lines } = await admin.from("sale_lines").select("id, description, quantity, unit_price, line_total").eq("sale_id", id).order("line_no");
  // Prior returned quantities per sale line (posted returns).
  const { data: prior } = await admin
    .from("sales_return_lines")
    .select("sale_line_id, quantity, sales_return:sales_returns!inner(document_status)")
    .in("sale_line_id", (lines ?? []).map((l) => l.id));
  const returnedMap = new Map<string, number>();
  for (const p of prior ?? []) {
    const pr = p as unknown as { sales_return: { document_status: string } | null; sale_line_id: string; quantity: number };
    const st = pr.sales_return?.document_status;
    if (st !== "posted") continue;
    returnedMap.set(pr.sale_line_id, (returnedMap.get(pr.sale_line_id) ?? 0) + Number(pr.quantity));
  }

  const rLines: RLine[] = (lines ?? []).map((l) => ({
    sale_line_id: l.id, description: l.description ?? "", sold: Number(l.quantity),
    returned: returnedMap.get(l.id) ?? 0, unit_price: Number(l.unit_price), line_total: Number(l.line_total),
  }));

  const { data: accounts } = await admin.from("payment_accounts")
    .select("id, name, branch_id").eq("company_id", ctx.companyId).eq("is_active", true).order("code");
  const branchAccounts = (accounts ?? []).filter((a) => !a.branch_id || a.branch_id === sale.branch_id);

  return (
    <div>
      <PageHeader title="Sales Return" description={`Against invoice ${sale.document_number}`} />
      <ReturnForm saleId={id} lines={rLines} accounts={branchAccounts as never} />
    </div>
  );
}
