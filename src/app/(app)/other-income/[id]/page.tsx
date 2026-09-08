import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermissionPage } from "@/lib/auth/guards";
import { getActiveContext, can } from "@/lib/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { postOtherIncome, deleteOtherIncomeDraft, voidOtherIncome } from "@/lib/other-income/actions";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DocStatusBadge } from "@/components/common/doc-status-badge";
import { TxnActions } from "@/components/common/txn-actions";
import { formatMoney, formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Other Income" };
type Params = Promise<{ id: string }>;

export default async function IncomeDetail(props: { params: Params }) {
  await requirePermissionPage("other_income.view");
  const ctx = await getActiveContext();
  const { id } = await props.params;
  const admin = createAdminClient();
  const { data: oi } = await admin.from("other_income_transactions").select("*, income_type:other_income_types(name), branch:branches(name)").eq("id", id).maybeSingle();
  if (!oi || oi.company_id !== ctx.companyId) notFound();
  const { data: receipts } = await admin.from("other_income_receipts").select("amount, account:payment_accounts(name)").eq("transaction_id", id);
  const e = oi as Record<string, unknown> as { document_number: string | null; document_status: string; document_date: string; received_from: string | null; description: string | null; reference: string | null; net_total: number; tax_total: number; grand_total: number; void_reason: string | null; income_type: { name: string } | null; branch: { name: string } | null };

  return (
    <div>
      <PageHeader title={e.document_number ?? "Other income (draft)"} description={`${e.income_type?.name} · ${e.branch?.name} · ${formatDate(e.document_date)}`}
        actions={<TxnActions id={id} status={e.document_status} canPost={can(ctx.user, "other_income.post")} canOwner={can(ctx.user, "transactions.void")} postAction={postOtherIncome} deleteAction={deleteOtherIncomeDraft} voidAction={voidOtherIncome} afterDeletePush="/other-income/history" />} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card><CardContent className="space-y-2 p-5 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Status</span><DocStatusBadge status={e.document_status} /></div>
          <div className="flex justify-between"><span className="text-muted-foreground">From</span><span>{e.received_from ?? "—"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Reference</span><span>{e.reference ?? "—"}</span></div>
          {e.void_reason && <div className="flex justify-between"><span className="text-muted-foreground">Void reason</span><span>{e.void_reason}</span></div>}
        </CardContent></Card>
        <Card><CardContent className="space-y-1.5 p-5 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Net</span><span className="tabular-nums">{formatMoney(e.net_total)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span className="tabular-nums">{formatMoney(e.tax_total)}</span></div>
          <div className="flex justify-between font-semibold"><span>Total</span><span className="tabular-nums">{formatMoney(e.grand_total)}</span></div>
        </CardContent></Card>
        <Card><CardContent className="p-5"><h3 className="mb-2 text-sm font-semibold">Received into</h3>
          <div className="space-y-1 text-sm">{(receipts ?? []).map((p, i) => { const pp = p as unknown as { account: { name: string } | null; amount: number }; return <div key={i} className="flex justify-between"><span className="text-muted-foreground">{pp.account?.name}</span><span className="tabular-nums">{formatMoney(pp.amount)}</span></div>; })}</div>
          {e.description && <p className="mt-3 text-sm text-muted-foreground">{e.description}</p>}
        </CardContent></Card>
      </div>
    </div>
  );
}
