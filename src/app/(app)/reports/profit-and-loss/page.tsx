import type { Metadata } from "next";
import { requirePermissionPage } from "@/lib/auth/guards";
import { getActiveContext } from "@/lib/context";
import { profitAndLoss } from "@/lib/reports/queries";
import { resolvePeriod, type SP } from "@/lib/reports/period";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { PeriodFilter, PrintButton, ExportCsvButton } from "@/components/reports/report-tools";
import { formatMoney, formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Profit and Loss" };

export default async function ProfitLossPage(props: { searchParams: Promise<SP> }) {
  await requirePermissionPage("reports.view_profit_loss");
  const ctx = await getActiveContext();
  const { start, end } = resolvePeriod(await props.searchParams);
  const pl = await profitAndLoss(ctx.companyId, start, end);

  const line = (label: string, value: number, opts: { bold?: boolean; strong?: boolean; indent?: boolean } = {}) => (
    <div className={`flex items-center justify-between py-1.5 ${opts.strong ? "border-t border-border pt-2 text-base font-semibold" : opts.bold ? "font-medium" : ""}`}>
      <span className={opts.indent ? "pl-4 text-muted-foreground" : ""}>{label}</span>
      <span className="tabular-nums">{formatMoney(value)}</span>
    </div>
  );

  return (
    <div>
      <PageHeader title="Profit and Loss" description={`${formatDate(start)} → ${formatDate(end)}`}
        actions={<div className="flex gap-2"><PrintButton /><ExportCsvButton filename="profit-and-loss.csv" header={["Line", "Amount"]} rows={[
          ["Sales Revenue", pl.salesRevenue], ["Sales Returns", pl.salesReturns], ["Net Sales", pl.netSales],
          ["Cost of Goods Sold", pl.cogs], ["Gross Profit", pl.grossProfit], ["Other Income", pl.otherIncome],
          ["Operating Expenses", pl.opExpenses], ["Operating Profit", pl.operatingProfit], ["Bank Charges", pl.bankCharges], ["Net Profit", pl.netProfit],
        ]} /></div>} />
      <div className="mb-4"><PeriodFilter start={start} end={end} /></div>
      <Card className="report-card max-w-2xl"><CardContent className="p-6 text-sm">
        {line("Sales Revenue", pl.salesRevenue)}
        {line("Less: Sales Returns", pl.salesReturns, { indent: true })}
        {line("Net Sales", pl.netSales, { bold: true })}
        {line("Cost of Goods Sold", pl.cogs, { indent: true })}
        {line("Gross Profit", pl.grossProfit, { strong: true })}
        {line("Other Income", pl.otherIncome)}
        {pl.expenseRows.length > 0 && <div className="pt-2 text-xs font-semibold uppercase text-muted-foreground">Operating Expenses</div>}
        {pl.expenseRows.map((e) => line(`${e.code} ${e.name}`, e.amount, { indent: true }))}
        {line("Total Operating Expenses", pl.opExpenses, { bold: true })}
        {line("Operating Profit", pl.operatingProfit, { strong: true })}
        {line("Finance & Bank Charges", pl.bankCharges, { indent: true })}
        {line("Net Profit / (Loss)", pl.netProfit, { strong: true })}
      </CardContent></Card>
    </div>
  );
}
