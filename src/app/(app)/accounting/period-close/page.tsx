import type { Metadata } from "next";
import { requirePermissionPage } from "@/lib/auth/guards";
import { getActiveContext } from "@/lib/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/format";
import { PeriodControls } from "./period-controls";

export const metadata: Metadata = { title: "Period Close" };

export default async function PeriodClosePage() {
  await requirePermissionPage("periods.view");
  const ctx = await getActiveContext();
  const admin = createAdminClient();
  const { data: periods } = await admin.from("accounting_periods")
    .select("id, name, financial_year, start_date, end_date, status")
    .eq("company_id", ctx.companyId).order("start_date", { ascending: false });

  return (
    <div>
      <PageHeader title="Accounting Period Closing" description="Run the close checklist, then close, reopen, lock or unlock periods." />
      {(periods ?? []).length === 0 ? <EmptyState title="No accounting periods" description="Create periods in Admin → Accounting Periods." /> : (
        <div className="space-y-3">
          {(periods ?? []).map((p) => (
            <Card key={p.id}><CardContent className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="font-semibold">{p.name} <span className="text-sm font-normal text-muted-foreground">· FY {p.financial_year}</span></p>
                  <p className="text-xs text-muted-foreground">{formatDate(p.start_date)} → {formatDate(p.end_date)}</p>
                </div>
                <Badge variant={p.status === "open" ? "success" : p.status === "locked" ? "destructive" : "muted"}>{p.status}</Badge>
              </div>
              <PeriodControls periodId={p.id} status={p.status} isOwner={ctx.user.isOwner} />
            </CardContent></Card>
          ))}
        </div>
      )}
    </div>
  );
}
