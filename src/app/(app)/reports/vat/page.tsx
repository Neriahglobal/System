import type { Metadata } from "next";
import { requirePermissionPage } from "@/lib/auth/guards";
import { getActiveContext } from "@/lib/context";
import { vatReport } from "@/lib/reports/subledger";
import { resolvePeriod, type SP } from "@/lib/reports/period";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PeriodFilter, PrintButton } from "@/components/reports/report-tools";
import { formatMoney, formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "VAT Report" };

export default async function VatReportPage(props: { searchParams: Promise<SP> }) {
  await requirePermissionPage("reports.view_vat");
  const ctx = await getActiveContext();
  const { start, end } = resolvePeriod(await props.searchParams);
  const v = await vatReport(ctx.companyId, start, end);
  const row = (label: string, value: number, strong = false) => (
    <div className={`flex justify-between py-1.5 ${strong ? "border-t border-border pt-2 font-semibold" : ""}`}><span className={strong ? "" : "text-muted-foreground"}>{label}</span><span className="tabular-nums">{formatMoney(value)}</span></div>
  );
  return (
    <div>
      <PageHeader title="VAT Report" description={`${formatDate(start)} → ${formatDate(end)} · internal report, not a TRA filing`} actions={<PrintButton />} />
      <div className="mb-4"><PeriodFilter start={start} end={end} /></div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="report-card"><CardContent className="p-6 text-sm">
          <h3 className="mb-2 text-sm font-semibold">Output VAT (on sales & income)</h3>
          {row("Output VAT on sales", v.outputSales)}
          {row("Less: sales-return reversals", v.outputReturns)}
          {row("Output VAT on other income", v.outputIncome)}
          {row("Total Output VAT", v.outputVat, true)}
          <div className="mt-2 flex items-center gap-2 text-xs">Control account 2120: {formatMoney(v.controlOutput)} {v.outputReconciled ? <Badge variant="success">Reconciled</Badge> : <Badge variant="destructive">Difference</Badge>}</div>
        </CardContent></Card>
        <Card className="report-card"><CardContent className="p-6 text-sm">
          <h3 className="mb-2 text-sm font-semibold">Input VAT (recoverable)</h3>
          {row("Input VAT on purchases", v.inputPurchases)}
          {row("Less: purchase-return reversals", v.inputReturns)}
          {row("Input VAT on expenses", v.inputExpenses)}
          {row("Total Input VAT", v.inputVat, true)}
          <div className="mt-2 flex items-center gap-2 text-xs">Control account 1160: {formatMoney(v.controlInput)} {v.inputReconciled ? <Badge variant="success">Reconciled</Badge> : <Badge variant="destructive">Difference</Badge>}</div>
        </CardContent></Card>
      </div>
      <Card className="report-card mt-4 max-w-md"><CardContent className="p-6 text-sm">
        {row("Net VAT payable / (refundable)", v.netVat, true)}
        {row("Non-recoverable tax (expensed)", v.nonRecoverable)}
      </CardContent></Card>
    </div>
  );
}
