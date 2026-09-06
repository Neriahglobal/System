import { Badge } from "@/components/ui/badge";

const DOC: Record<string, { label: string; variant: "default" | "success" | "muted" | "destructive" | "warning" | "secondary" }> = {
  draft: { label: "Draft", variant: "muted" },
  posted: { label: "Posted", variant: "success" },
  voided: { label: "Voided", variant: "destructive" },
  dispatched: { label: "Dispatched", variant: "default" },
  partially_received: { label: "Partial", variant: "warning" },
  received: { label: "Received", variant: "success" },
};

const PAY: Record<string, { label: string; variant: "default" | "success" | "muted" | "destructive" | "warning" | "secondary" }> = {
  unpaid: { label: "Unpaid", variant: "destructive" },
  partially_paid: { label: "Partial", variant: "warning" },
  paid: { label: "Paid", variant: "success" },
  refunded: { label: "Refunded", variant: "muted" },
  partially_refunded: { label: "Part. refunded", variant: "warning" },
};

export function DocStatusBadge({ status }: { status: string }) {
  const s = DOC[status] ?? { label: status, variant: "secondary" as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export function PayStatusBadge({ status }: { status: string }) {
  const s = PAY[status] ?? { label: status, variant: "secondary" as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}
