import type { Metadata } from "next";
import { requirePermissionPage } from "@/lib/auth/guards";
import { getActiveContext } from "@/lib/context";
import { balanceSheet } from "@/lib/reports/queries";
import { resolveAsOf, type SP } from "@/lib/reports/period";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { AsOfFilter, PrintButton, ExportCsvButton } from "@/components/reports/report-tools";
import { formatMoney, formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Balance Sheet" };

export default async function BalanceSheetPage(props: { searchParams: Promise<SP> }) {
  await requirePermissionPage("reports.view_balance_sheet");
  const ctx = await getActiveContext();
  const asOf = resolveAsOf(await props.searchParams);
  const bs = await balanceSheet(ctx.companyId, asOf);

  const Section = ({ title, rows, total }: { title: string; rows: { code: string; name: string; amount: number }[]; total: number }) => (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{title}</p>
      {rows.map((r) => <div key={r.code} className="flex justify-between py-0.5 text-sm"><span className="pl-2 text-muted-foreground">{r.name}</span><span className="tabular-nums">{formatMoney(r.amount)}</span></div>)}
      <div className="flex justify-between border-t border-border pt-1 text-sm font-semibold"><span>Total {title}</span><span className="tabular-nums">{formatMoney(total)}</span></div>
    </div>
  );

  return (
    <div>
      <PageHeader title="Balance Sheet" description={`As of ${formatDate(asOf)}`}
        actions={<div className="flex gap-2"><PrintButton /><ExportCsvButton filename="balance-sheet.csv" header={["Section", "Account", "Amount"]} rows={[
          ...bs.assetsRows.map((r) => ["Assets", r.name, r.amount] as (string | number)[]),
          ...bs.liabRows.map((r) => ["Liabilities", r.name, r.amount] as (string | number)[]),
          ...bs.equityRows.map((r) => ["Equity", r.name, r.amount] as (string | number)[]),
          ["Equity", "Current Period Earnings", bs.currentEarnings],
        ]} /></div>} />
      <div className="mb-4"><AsOfFilter asOf={asOf} /></div>

      {!bs.balanced && (
        <Card className="mb-4 border-destructive"><CardContent className="p-4 text-sm text-destructive">
          Accounting exception: Assets {formatMoney(bs.assets)} ≠ Liabilities + Equity {formatMoney(bs.liabilities + bs.equity)} (difference {formatMoney(bs.difference)}).
        </CardContent></Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="report-card"><CardContent className="space-y-4 p-6">
          <Section title="Assets" rows={bs.assetsRows} total={bs.assets} />
        </CardContent></Card>
        <Card className="report-card"><CardContent className="space-y-4 p-6">
          <Section title="Liabilities" rows={bs.liabRows} total={bs.liabilities} />
          <Section title="Equity" rows={[...bs.equityRows, { code: "_ce", name: "Current Period Earnings", amount: bs.currentEarnings }]} total={bs.equity} />
          <div className="flex justify-between border-t-2 border-foreground pt-2 text-base font-bold"><span>Liabilities + Equity</span><span className="tabular-nums">{formatMoney(bs.liabilities + bs.equity)}</span></div>
        </CardContent></Card>
      </div>
    </div>
  );
}
