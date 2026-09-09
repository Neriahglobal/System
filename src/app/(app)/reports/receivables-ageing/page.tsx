import type { Metadata } from "next";
import { requirePermissionPage } from "@/lib/auth/guards";
import { getActiveContext } from "@/lib/context";
import { receivablesAgeing } from "@/lib/reports/subledger";
import { resolveAsOf, type SP } from "@/lib/reports/period";
import { PageHeader } from "@/components/ui/page-header";
import { AsOfFilter, PrintButton } from "@/components/reports/report-tools";
import { AgeingView } from "@/components/reports/ageing-view";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Receivables Ageing" };

export default async function ReceivablesAgeingPage(props: { searchParams: Promise<SP> }) {
  await requirePermissionPage("reports.view_receivables");
  const ctx = await getActiveContext();
  const asOf = resolveAsOf(await props.searchParams);
  const data = await receivablesAgeing(ctx.companyId, asOf);
  return (
    <div>
      <PageHeader title="Customer Receivables Ageing" description={`As of ${formatDate(asOf)}`} actions={<PrintButton />} />
      <div className="mb-4"><AsOfFilter asOf={asOf} /></div>
      <AgeingView data={data} controlLabel="Accounts Receivable (1140)" />
    </div>
  );
}
