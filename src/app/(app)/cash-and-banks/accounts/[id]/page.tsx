import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermissionPage } from "@/lib/auth/guards";
import { getActiveContext } from "@/lib/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatMoney, formatDateTime } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Account Ledger" };
type Params = Promise<{ id: string }>;

const TYPE_LABEL: Record<string, string> = {
  sale: "Sale", customer_receipt: "Customer receipt", sale_void: "Sale void", sales_return: "Sales return",
  purchase: "Purchase", supplier_payment: "Supplier payment", purchase_return: "Purchase return",
  expense: "Expense", other_income: "Other income", cash_transfer: "Cash transfer",
  financial_opening_line: "Opening balance", cash_transfer_void: "Transfer void", expense_void: "Expense void",
};

export default async function AccountLedgerPage(props: { params: Params }) {
  await requirePermissionPage("cash_accounts.view_ledger");
  const ctx = await getActiveContext();
  const { id } = await props.params;
  const admin = createAdminClient();

  const { data: pa } = await admin.from("payment_accounts").select("id, code, name, ledger_account_id, company_id").eq("id", id).maybeSingle();
  if (!pa || pa.company_id !== ctx.companyId || !pa.ledger_account_id) notFound();

  const { data: lines } = await admin.from("journal_lines")
    .select("debit, credit, journal:journal_entries!inner(entry_date, created_at, source_type, source_number, memo)")
    .eq("account_id", pa.ledger_account_id).limit(500);

  type Row = { debit: number; credit: number; journal: { entry_date: string; created_at: string; source_type: string; source_number: string | null; memo: string | null } };
  const rows = ((lines ?? []) as unknown as Row[])
    .sort((a, b) => (a.journal.created_at < b.journal.created_at ? -1 : 1));
  let running = 0;
  const ledger = rows.map((r) => { running += Number(r.debit) - Number(r.credit); return { ...r, running }; });
  const closing = running;

  return (
    <div>
      <PageHeader title={`Ledger — ${pa.name}`} description="Derived from posted journal entries. Immutable." />
      <Card className="mb-4"><CardContent className="flex flex-wrap gap-8 p-5 text-sm">
        <div><p className="text-xs uppercase text-muted-foreground">Movements</p><p className="font-semibold">{ledger.length}</p></div>
        <div><p className="text-xs uppercase text-muted-foreground">Closing balance</p><p className="font-semibold tabular-nums">{formatMoney(closing)}</p></div>
      </CardContent></Card>
      {ledger.length === 0 ? <EmptyState title="No transactions on this account yet" /> : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader><TableRow>
              <TableHead>When</TableHead><TableHead>Type</TableHead><TableHead>Document</TableHead>
              <TableHead className="text-right">Money in</TableHead><TableHead className="text-right">Money out</TableHead><TableHead className="text-right">Balance</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {ledger.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="whitespace-nowrap text-xs tabular-nums">{formatDateTime(r.journal.created_at)}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-[11px]">{TYPE_LABEL[r.journal.source_type] ?? r.journal.source_type}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{r.journal.source_number ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums text-success">{Number(r.debit) > 0 ? formatMoney(r.debit) : ""}</TableCell>
                  <TableCell className="text-right tabular-nums text-destructive">{Number(r.credit) > 0 ? formatMoney(r.credit) : ""}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{formatMoney(r.running)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
