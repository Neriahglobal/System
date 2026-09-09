import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermissionPage } from "@/lib/auth/guards";
import { getActiveContext, can } from "@/lib/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { postManualJournal, deleteManualJournalDraft, voidManualJournal } from "@/lib/accounting/actions";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DocStatusBadge } from "@/components/common/doc-status-badge";
import { TxnActions } from "@/components/common/txn-actions";
import { formatMoney, formatDate } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Journal" };
type Params = Promise<{ id: string }>;

export default async function JournalDetail(props: { params: Params }) {
  await requirePermissionPage("accounting.view_journals");
  const ctx = await getActiveContext();
  const { id } = await props.params;
  const admin = createAdminClient();
  const { data: j } = await admin.from("manual_journal_drafts").select("*").eq("id", id).maybeSingle();
  if (!j || j.company_id !== ctx.companyId) notFound();

  // Draft lines (for drafts) or posted journal lines (for posted).
  const draftLines = j.document_status === "draft"
    ? (await admin.from("manual_journal_draft_lines").select("debit, credit, description, account:chart_of_accounts(code, name)").eq("draft_id", id).order("line_no")).data
    : (await admin.from("journal_lines").select("debit, credit, memo, account:chart_of_accounts(code, name)").eq("journal_id", j.journal_id).order("line_no")).data;
  const lines = (draftLines ?? []) as unknown as Array<{ debit: number; credit: number; description?: string; memo?: string; account: { code: string; name: string } | null }>;
  const v = j as Record<string, unknown> as { document_number: string | null; document_status: string; journal_date: string; reference: string | null; description: string | null; total_debit: number; total_credit: number; void_reason: string | null };

  return (
    <div>
      <PageHeader title={v.document_number ?? "Manual journal (draft)"} description={`${formatDate(v.journal_date)} · ${v.reference ?? ""}`}
        actions={<TxnActions id={id} status={v.document_status} canPost={can(ctx.user, "accounting.post_manual_journal")} canOwner={can(ctx.user, "transactions.void")} postAction={postManualJournal} deleteAction={deleteManualJournalDraft} voidAction={voidManualJournal} postLabel="Post journal" afterDeletePush="/accounting/journals" />} />
      <Card className="mb-4"><CardContent className="flex flex-wrap items-center gap-6 p-5 text-sm">
        <div><span className="text-muted-foreground">Status</span> <DocStatusBadge status={v.document_status} /></div>
        <div><span className="text-muted-foreground">Description</span> {v.description ?? "—"}</div>
        {v.void_reason && <div><span className="text-muted-foreground">Void reason</span> {v.void_reason}</div>}
      </CardContent></Card>
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead></TableRow></TableHeader>
          <TableBody>
            {lines.map((l, i) => (
              <TableRow key={i}>
                <TableCell className="text-sm">{l.account?.code} — {l.account?.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{l.description ?? l.memo ?? ""}</TableCell>
                <TableCell className="text-right tabular-nums">{Number(l.debit) ? formatMoney(l.debit) : ""}</TableCell>
                <TableCell className="text-right tabular-nums">{Number(l.credit) ? formatMoney(l.credit) : ""}</TableCell>
              </TableRow>
            ))}
            <TableRow className="font-semibold"><TableCell colSpan={2}>Totals</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(v.total_debit)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(v.total_credit)}</TableCell></TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
