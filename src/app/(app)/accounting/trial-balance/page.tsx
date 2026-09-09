import type { Metadata } from "next";
import { requirePermissionPage } from "@/lib/auth/guards";
import { getActiveContext } from "@/lib/context";
import { trialBalance } from "@/lib/reports/queries";
import { resolvePeriod, type SP } from "@/lib/reports/period";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PeriodFilter, PrintButton, ExportCsvButton } from "@/components/reports/report-tools";
import { formatMoney, formatDate } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Trial Balance" };

export default async function TrialBalancePage(props: { searchParams: Promise<SP> }) {
  await requirePermissionPage("accounting.view_trial_balance");
  const ctx = await getActiveContext();
  const { start, end } = resolvePeriod(await props.searchParams);
  const rows = (await trialBalance(ctx.companyId, start, end)).filter((r) => r.allow_posting);

  const dr = (net: number) => (net > 0 ? net : 0);
  const cr = (net: number) => (net < 0 ? -net : 0);
  const totals = rows.reduce((a, r) => ({
    od: a.od + dr(r.opening_net), oc: a.oc + cr(r.opening_net),
    pd: a.pd + r.period_debit, pc: a.pc + r.period_credit,
    cd: a.cd + dr(r.closing_net), cc: a.cc + cr(r.closing_net),
  }), { od: 0, oc: 0, pd: 0, pc: 0, cd: 0, cc: 0 });
  const balanced = Math.abs(totals.cd - totals.cc) < 0.005;

  const visible = rows.filter((r) => r.opening_net || r.period_debit || r.period_credit || r.closing_net);

  return (
    <div>
      <PageHeader title="Trial Balance" description={`${formatDate(start)} → ${formatDate(end)} · generated ${formatDate(new Date().toISOString())}`}
        actions={<div className="flex gap-2"><PrintButton /><ExportCsvButton filename="trial-balance.csv"
          header={["Code", "Account", "Type", "Opening Dr", "Opening Cr", "Period Dr", "Period Cr", "Closing Dr", "Closing Cr"]}
          rows={visible.map((r) => [r.code, r.name, r.account_type, dr(r.opening_net), cr(r.opening_net), r.period_debit, r.period_credit, dr(r.closing_net), cr(r.closing_net)])} /></div>} />
      <div className="mb-4"><PeriodFilter start={start} end={end} /></div>

      {!balanced && (
        <Card className="mb-4 border-destructive"><CardContent className="p-4 text-sm text-destructive">
          Trial balance does not balance — closing debits {formatMoney(totals.cd)} vs credits {formatMoney(totals.cc)}. Investigate before relying on reports.
        </CardContent></Card>
      )}

      <div className="report-card rounded-lg border border-border bg-card">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Code</TableHead><TableHead>Account</TableHead>
            <TableHead className="text-right">Opening Dr</TableHead><TableHead className="text-right">Opening Cr</TableHead>
            <TableHead className="text-right">Period Dr</TableHead><TableHead className="text-right">Period Cr</TableHead>
            <TableHead className="text-right">Closing Dr</TableHead><TableHead className="text-right">Closing Cr</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {visible.map((r) => (
              <TableRow key={r.account_id}>
                <TableCell className="font-mono text-xs">{r.code}</TableCell>
                <TableCell className="text-sm">{r.name}</TableCell>
                <TableCell className="text-right tabular-nums">{dr(r.opening_net) ? formatMoney(dr(r.opening_net)) : ""}</TableCell>
                <TableCell className="text-right tabular-nums">{cr(r.opening_net) ? formatMoney(cr(r.opening_net)) : ""}</TableCell>
                <TableCell className="text-right tabular-nums">{r.period_debit ? formatMoney(r.period_debit) : ""}</TableCell>
                <TableCell className="text-right tabular-nums">{r.period_credit ? formatMoney(r.period_credit) : ""}</TableCell>
                <TableCell className="text-right tabular-nums">{dr(r.closing_net) ? formatMoney(dr(r.closing_net)) : ""}</TableCell>
                <TableCell className="text-right tabular-nums">{cr(r.closing_net) ? formatMoney(cr(r.closing_net)) : ""}</TableCell>
              </TableRow>
            ))}
            <TableRow className="font-semibold">
              <TableCell colSpan={2}>Totals {balanced ? <Badge variant="success" className="ml-2">Balanced</Badge> : <Badge variant="destructive" className="ml-2">Out of balance</Badge>}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(totals.od)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(totals.oc)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(totals.pd)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(totals.pc)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(totals.cd)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(totals.cc)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
