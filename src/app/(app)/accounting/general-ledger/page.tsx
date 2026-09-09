import type { Metadata } from "next";
import { requirePermissionPage } from "@/lib/auth/guards";
import { getActiveContext } from "@/lib/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { generalLedger } from "@/lib/reports/queries";
import { resolvePeriod, type SP } from "@/lib/reports/period";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PeriodFilter, PrintButton, ExportCsvButton, AccountPicker } from "@/components/reports/report-tools";
import { formatMoney, formatDate } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "General Ledger" };

export default async function GeneralLedgerPage(props: { searchParams: Promise<SP> }) {
  await requirePermissionPage("accounting.view_general_ledger");
  const ctx = await getActiveContext();
  const sp = await props.searchParams;
  const { start, end } = resolvePeriod(sp);
  const accountId = typeof sp.account === "string" ? sp.account : "";
  const admin = createAdminClient();
  const { data: accounts } = await admin.from("chart_of_accounts").select("id, code, name").eq("company_id", ctx.companyId).eq("is_active", true).eq("allow_posting", true).order("code");
  const acc = accountId ? (accounts ?? []).find((a) => a.id === accountId) : null;
  const gl = acc ? await generalLedger(ctx.companyId, accountId, start, end) : null;

  return (
    <div>
      <PageHeader title="General Ledger" description={acc ? `${acc.code} — ${acc.name} · ${formatDate(start)} → ${formatDate(end)}` : "Select an account"}
        actions={gl ? <div className="flex gap-2"><PrintButton /><ExportCsvButton filename="general-ledger.csv" header={["Date", "Journal", "Source", "Debit", "Credit", "Balance"]}
          rows={gl.lines.map((l) => [l.entry_date, l.source_number ?? "", l.source_type, l.debit, l.credit, l.running])} /></div> : null} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <AccountPicker accounts={(accounts ?? []) as never} value={accountId} />
        <PeriodFilter start={start} end={end} />
      </div>

      {!acc ? <EmptyState title="Choose an account" description="Pick an account to view its ledger." /> : (
        <>
          <Card className="report-card mb-3"><CardContent className="flex flex-wrap gap-8 p-4 text-sm">
            <div><p className="text-xs uppercase text-muted-foreground">Opening</p><p className="font-semibold tabular-nums">{formatMoney(gl!.opening)}</p></div>
            <div><p className="text-xs uppercase text-muted-foreground">Period debit</p><p className="font-semibold tabular-nums">{formatMoney(gl!.periodDebit)}</p></div>
            <div><p className="text-xs uppercase text-muted-foreground">Period credit</p><p className="font-semibold tabular-nums">{formatMoney(gl!.periodCredit)}</p></div>
            <div><p className="text-xs uppercase text-muted-foreground">Closing</p><p className="font-semibold tabular-nums">{formatMoney(gl!.closing)}</p></div>
          </CardContent></Card>
          <div className="report-card rounded-lg border border-border bg-card">
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Journal / Source</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
              <TableBody>
                <TableRow><TableCell colSpan={5} className="text-sm font-medium">Opening balance</TableCell><TableCell className="text-right tabular-nums font-medium">{formatMoney(gl!.opening)}</TableCell></TableRow>
                {gl!.lines.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell className="whitespace-nowrap text-sm">{formatDate(l.entry_date)}</TableCell>
                    <TableCell className="font-mono text-xs">{l.source_number ?? l.source_type}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{l.memo ?? ""}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.debit ? formatMoney(l.debit) : ""}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.credit ? formatMoney(l.credit) : ""}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(l.running)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
