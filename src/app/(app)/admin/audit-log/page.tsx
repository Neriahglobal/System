import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireOwnerPage } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { AuditTable, type AuditRow } from "./audit-table";

export const metadata: Metadata = { title: "Audit Log" };
const PAGE_SIZE = 25;

export default async function AuditLogPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireOwnerPage();
  const admin = createAdminClient();

  const sp = await props.searchParams;
  const page = typeof sp.page === "string" ? Math.max(1, parseInt(sp.page, 10) || 1) : 1;
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, count } = await admin
    .from("audit_logs")
    .select(
      "id, created_at, action, resource_type, resource_id, reason, user_id, ip_address, old_values, new_values",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  const rows = (data ?? []) as (Omit<AuditRow, "user_email"> & { user_id: string | null })[];

  // Resolve user emails.
  const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[];
  const emailMap = new Map<string, string>();
  if (userIds.length) {
    const { data: users } = await admin
      .from("user_profiles")
      .select("id, email")
      .in("id", userIds);
    for (const u of users ?? []) emailMap.set(u.id, u.email);
  }

  const auditRows: AuditRow[] = rows.map((r) => ({
    ...r,
    user_email: r.user_id ? emailMap.get(r.user_id) ?? null : null,
  }));

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="Audit Log"
        description="Immutable record of administrative activity. Records cannot be edited or deleted."
      />
      <AuditTable rows={auditRows} />

      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {from + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" disabled={page <= 1}>
              <Link href={`/admin/audit-log?page=${page - 1}`}>
                <ChevronLeft className="h-4 w-4" /> Prev
              </Link>
            </Button>
            <span>Page {page} of {totalPages}</span>
            <Button asChild variant="outline" size="sm" disabled={page >= totalPages}>
              <Link href={`/admin/audit-log?page=${page + 1}`}>
                Next <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
