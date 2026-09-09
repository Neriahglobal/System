import type { Metadata } from "next";
import { requirePermissionPage } from "@/lib/auth/guards";
import { getActiveContext } from "@/lib/context";
import { reconciliationControls } from "@/lib/reports/subledger";
import { resolveAsOf, type SP } from "@/lib/reports/period";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { AsOfFilter } from "@/components/reports/report-tools";
import { formatMoney, formatDate } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Reconciliation Controls" };

export default async function ReconciliationControlsPage(props: { searchParams: Promise<SP> }) {
  await requirePermissionPage("accounting.view_control_accounts");
  const ctx = await getActiveContext();
  const asOf = resolveAsOf(await props.searchParams);
  const controls = await reconciliationControls(ctx.companyId, asOf);

  return (
    <div>
      <PageHeader title="Accounting Reconciliation Controls" description={`Subledgers vs General Ledger as of ${formatDate(asOf)}`} />
      <div className="mb-4"><AsOfFilter asOf={asOf} /></div>
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Control</TableHead><TableHead className="text-right">Subledger</TableHead><TableHead className="text-right">General Ledger</TableHead><TableHead className="text-right">Difference</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {controls.map((c) => (
              <TableRow key={c.key}>
                <TableCell className="text-sm">{c.label}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(c.subledger)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(c.gl)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(c.difference)}</TableCell>
                <TableCell>{c.status === "Reconciled" ? <Badge variant="success">Reconciled</Badge> : <Badge variant="destructive">Difference found</Badge>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Payment-account ledgers reconcile by construction (balances are derived from the same journal lines). Differences here indicate subledger vs GL drift that must be investigated before closing a period.</p>
    </div>
  );
}
