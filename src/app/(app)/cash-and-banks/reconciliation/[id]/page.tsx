import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermissionPage } from "@/lib/auth/guards";
import { getActiveContext, can } from "@/lib/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatMoney } from "@/lib/format";
import { RecWorkspace, type StmtLine, type ErpEntry } from "./rec-workspace";

export const metadata: Metadata = { title: "Reconciliation" };
type Params = Promise<{ id: string }>;

export default async function ReconciliationDetail(props: { params: Params }) {
  await requirePermissionPage("reconciliation.view");
  const ctx = await getActiveContext();
  const { id } = await props.params;
  const admin = createAdminClient();

  const { data: rec } = await admin.from("bank_reconciliations")
    .select("*, account:payment_accounts(name, ledger_account_id)").eq("id", id).maybeSingle();
  if (!rec || rec.company_id !== ctx.companyId) notFound();

  const { data: lines } = await admin.from("bank_statement_lines").select("id, txn_date, description, reference, money_in, money_out, matched_amount, status").eq("reconciliation_id", id).order("txn_date");
  const stmtLines = (lines ?? []) as unknown as StmtLine[];
  const statementNet = Math.round(stmtLines.reduce((s, l) => s + Number(l.money_in) - Number(l.money_out), 0) * 100) / 100;
  const declaredNet = Math.round((Number(rec.statement_closing) - Number(rec.statement_opening)) * 100) / 100;

  // Candidate ERP entries: posted journal lines on this account's ledger, in range, not yet matched.
  const ledgerId = (rec.account as unknown as { ledger_account_id: string }).ledger_account_id;
  const { data: matched } = await admin.from("bank_reconciliation_matches").select("journal_line_id").eq("reconciliation_id", id);
  const matchedSet = new Set((matched ?? []).map((m) => m.journal_line_id));
  const { data: jls } = await admin.from("journal_lines")
    .select("id, debit, credit, journal:journal_entries!inner(entry_date, source_number, memo, company_id)")
    .eq("account_id", ledgerId).limit(300);
  const erpEntries: ErpEntry[] = ((jls ?? []) as unknown as Array<{ id: string; debit: number; credit: number; journal: { entry_date: string; source_number: string | null; memo: string | null; company_id: string } }>)
    .filter((j) => j.journal.company_id === ctx.companyId && j.journal.entry_date >= rec.statement_start && j.journal.entry_date <= rec.statement_end && !matchedSet.has(j.id))
    .map((j) => ({ journal_line_id: j.id, entry_date: j.journal.entry_date, source_number: j.journal.source_number, amount: Math.round((Number(j.debit) - Number(j.credit)) * 100) / 100, memo: j.journal.memo }));

  const { data: accounts } = await admin.from("chart_of_accounts").select("id, code, name").eq("company_id", ctx.companyId).eq("is_active", true).eq("allow_posting", true).order("code");

  const acc = rec.account as unknown as { name: string };
  return (
    <div>
      <PageHeader title={`Reconciliation — ${acc.name}`}
        description={`${formatDate(rec.statement_start)} → ${formatDate(rec.statement_end)} · closing ${formatMoney(rec.statement_closing)}`}
        actions={<Badge variant={rec.status === "finalized" ? "success" : "muted"}>{String(rec.status).replace("_", " ")}</Badge>} />
      <RecWorkspace recId={id} status={rec.status} finalized={rec.status === "finalized"}
        statementNet={statementNet} declaredNet={declaredNet}
        canFinalize={can(ctx.user, "reconciliation.finalize")} isOwner={ctx.user.isOwner}
        lines={stmtLines} erpEntries={erpEntries} adjustmentAccounts={(accounts ?? []) as never} />
    </div>
  );
}
