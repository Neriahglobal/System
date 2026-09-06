import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermissionPage } from "@/lib/auth/guards";
import { getActiveContext, can } from "@/lib/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatQuantity, formatDate } from "@/lib/format";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { DocStatusBadge } from "@/components/common/doc-status-badge";
import { TransferActions, type TLine } from "./transfer-actions";

export const metadata: Metadata = { title: "Transfer" };

type Params = Promise<{ id: string }>;

export default async function TransferDetailPage(props: { params: Params }) {
  await requirePermissionPage("inventory.transfer_create");
  const ctx = await getActiveContext();
  const { id } = await props.params;
  const admin = createAdminClient();

  const { data: t } = await admin.from("stock_transfers")
    .select("*, source:branches!stock_transfers_source_branch_id_fkey(name,code), dest:branches!stock_transfers_destination_branch_id_fkey(name,code)")
    .eq("id", id).maybeSingle();
  if (!t || t.company_id !== ctx.companyId) notFound();

  const { data: lines } = await admin.from("stock_transfer_lines")
    .select("id, qty_requested, qty_dispatched, qty_received, unit_cost, product:products(sku,name)")
    .eq("transfer_id", id).order("line_no");
  const rows = (lines ?? []) as unknown as Array<{
    id: string; qty_requested: number; qty_dispatched: number; qty_received: number; unit_cost: number;
    product: { sku: string; name: string } | null;
  }>;
  const tLines: TLine[] = rows.map((r) => ({
    id: r.id, sku: r.product?.sku ?? "", name: r.product?.name ?? "",
    qty_dispatched: Number(r.qty_dispatched), qty_received: Number(r.qty_received),
  }));

  const th = t as unknown as {
    document_number: string | null; status: string; transfer_date: string; reference: string | null; void_reason: string | null;
    source: { name: string; code: string } | null; dest: { name: string; code: string } | null;
  };

  return (
    <div>
      <PageHeader
        title={th.document_number ?? "Transfer (draft)"}
        description={`${th.source?.name} → ${th.dest?.name}`}
        actions={
          <TransferActions id={id} status={th.status} lines={tLines}
            canDispatch={can(ctx.user, "inventory.transfer_dispatch")}
            canReceive={can(ctx.user, "inventory.transfer_receive")}
            canVoid={can(ctx.user, "transactions.void")} />
        }
      />
      <Card className="mb-4">
        <CardContent className="flex flex-wrap gap-x-8 gap-y-3 p-5 text-sm">
          <div><p className="text-xs uppercase text-muted-foreground">Status</p><DocStatusBadge status={th.status} /></div>
          <div><p className="text-xs uppercase text-muted-foreground">Date</p><p>{formatDate(th.transfer_date)}</p></div>
          <div><p className="text-xs uppercase text-muted-foreground">Reference</p><p>{th.reference ?? "—"}</p></div>
          {th.void_reason && <div><p className="text-xs uppercase text-muted-foreground">Void reason</p><p>{th.void_reason}</p></div>}
        </CardContent>
      </Card>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Requested</TableHead>
              <TableHead className="text-right">Dispatched</TableHead>
              <TableHead className="text-right">Received</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell><span className="font-mono text-xs">{r.product?.sku}</span> — {r.product?.name}</TableCell>
                <TableCell className="text-right tabular-nums">{formatQuantity(r.qty_requested)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatQuantity(r.qty_dispatched)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatQuantity(r.qty_received)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatQuantity(Number(r.qty_dispatched) - Number(r.qty_received))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
