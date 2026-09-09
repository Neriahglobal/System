import type { Metadata } from "next";
import { requirePermissionPage } from "@/lib/auth/guards";
import { getActiveContext } from "@/lib/context";
import { cashFlow } from "@/lib/reports/queries";
import { resolvePeriod, type SP } from "@/lib/reports/period";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { PeriodFilter, PrintButton } from "@/components/reports/report-tools";
import { formatMoney, formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Cash Flow" };

export default async function CashFlowPage(props: { searchParams: Promise<SP> }) {
  await requirePermissionPage("reports.view_cash_flow");
  const ctx = await getActiveContext();
  const { start, end } = resolvePeriod(await props.searchParams);
  const cf = await cashFlow(ctx.companyId, start, end);
  const row = (label: string, value: number, strong = false) => (
    <div className={`flex justify-between py-1.5 ${strong ? "border-t border-border pt-2 font-semibold" : ""}`}><span className={strong ? "" : "text-muted-foreground"}>{label}</span><span className="tabular-nums">{formatMoney(value)}</span></div>
  );
  return (
    <div>
      <PageHeader title="Cash Flow Statement" description={`${formatDate(start)} → ${formatDate(end)} · from posted cash/bank/mobile movements`}
        actions={<PrintButton />} />
      <div className="mb-4"><PeriodFilter start={start} end={end} /></div>
      <Card className="report-card max-w-xl"><CardContent className="p-6 text-sm">
        {row("Opening cash & bank", cf.opening, true)}
        {row("Operating activities", cf.operating)}
        {row("Investing activities", cf.investing)}
        {row("Financing activities", cf.financing)}
        {cf.excluded !== 0 && row("Excluded (transfers / openings)", cf.excluded)}
        {cf.unclassified !== 0 && row("Unclassified (exception — needs classification)", cf.unclassified)}
        {row("Net movement", cf.net, true)}
        {row("Closing cash & bank", cf.closing, true)}
        <p className="mt-3 text-xs text-muted-foreground">Closing cash reconciles to the sum of posted payment-account ledger balances at {formatDate(end)}.</p>
      </CardContent></Card>
    </div>
  );
}
