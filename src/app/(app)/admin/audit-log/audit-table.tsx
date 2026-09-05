"use client";

import * as React from "react";
import { Eye } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface AuditRow {
  id: string;
  created_at: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  reason: string | null;
  user_email: string | null;
  ip_address: string | null;
  old_values: unknown;
  new_values: unknown;
}

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  const [detail, setDetail] = React.useState<AuditRow | null>(null);

  if (rows.length === 0) {
    return <EmptyState title="No audit records yet" description="Administrative actions will appear here." />;
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Resource</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead className="w-10 text-right">Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap text-xs tabular-nums">
                {formatDateTime(r.created_at)}
              </TableCell>
              <TableCell className="text-sm">{r.user_email ?? "—"}</TableCell>
              <TableCell>
                <Badge variant="secondary" className="font-mono text-[11px]">
                  {r.action}
                </Badge>
              </TableCell>
              <TableCell className="text-sm">
                {r.resource_type}
                {r.resource_id && (
                  <span className="ml-1 font-mono text-[11px] text-muted-foreground">
                    #{String(r.resource_id).slice(0, 8)}
                  </span>
                )}
              </TableCell>
              <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground">
                {r.reason ?? "—"}
              </TableCell>
              <TableCell className="text-right">
                <button
                  onClick={() => setDetail(r)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
                  aria-label="View details"
                >
                  <Eye className="h-4 w-4" />
                </button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Audit record</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <Meta label="When" value={formatDateTime(detail.created_at)} />
                <Meta label="User" value={detail.user_email ?? "—"} />
                <Meta label="Action" value={detail.action} />
                <Meta label="Resource" value={detail.resource_type} />
                <Meta label="Resource ID" value={detail.resource_id ?? "—"} />
                <Meta label="IP" value={detail.ip_address ?? "—"} />
              </div>
              {detail.reason && <Meta label="Reason" value={detail.reason} />}
              <JsonBlock label="Previous values" value={detail.old_values} />
              <JsonBlock label="New values" value={detail.new_values} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="break-words">{value}</p>
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value == null) return null;
  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <pre className="max-h-56 overflow-auto rounded-md bg-muted p-3 text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
