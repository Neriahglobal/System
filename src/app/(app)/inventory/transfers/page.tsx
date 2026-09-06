import type { Metadata } from "next";
import Link from "next/link";
import { requirePermissionPage } from "@/lib/auth/guards";
import { getActiveContext, can } from "@/lib/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/format";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { NewTransferButton } from "./transfer-form";
import { DocStatusBadge } from "@/components/common/doc-status-badge";

export const metadata: Metadata = { title: "Stock Transfers" };

export default async function TransfersPage() {
  await requirePermissionPage("inventory.transfer_create");
  const ctx = await getActiveContext();
  const admin = createAdminClient();
  const canDispatch = can(ctx.user, "inventory.transfer_dispatch");

  const { data: products } = await admin.from("products")
    .select("id, sku, name").eq("company_id", ctx.companyId).eq("is_active", true).order("sku");

  const { data: rows } = await admin.from("stock_transfers")
    .select("id, document_number, transfer_date, status, reference, source:branches!stock_transfers_source_branch_id_fkey(code), dest:branches!stock_transfers_destination_branch_id_fkey(code)")
    .eq("company_id", ctx.companyId).order("created_at", { ascending: false }).limit(100);
  const list = (rows ?? []) as unknown as Array<{
    id: string; document_number: string | null; transfer_date: string; status: string; reference: string | null;
    source: { code: string } | null; dest: { code: string } | null;
  }>;

  return (
    <div>
      <PageHeader
        title="Stock Transfers"
        description="Move stock between branches. Dispatch reduces source stock; receipt adds it at the destination."
        actions={ctx.branchId && <NewTransferButton products={(products ?? []) as never} branches={ctx.branches} sourceBranchId={ctx.branchId} canDispatch={canDispatch} />}
      />
      {list.length === 0 ? (
        <EmptyState title="No transfers yet" />
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>From → To</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.document_number ?? <Badge variant="muted">Draft</Badge>}</TableCell>
                  <TableCell className="text-sm">{formatDate(r.transfer_date)}</TableCell>
                  <TableCell className="text-sm">{r.source?.code} → {r.dest?.code}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.reference ?? "—"}</TableCell>
                  <TableCell><DocStatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-right">
                    <Link href={`/inventory/transfers/${r.id}`} className="text-sm font-medium text-primary hover:underline">Open</Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
