"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { runPeriodChecks, closePeriod, reopenPeriod, lockPeriod, unlockPeriod, type CloseCheck } from "@/lib/accounting/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function PeriodControls({ periodId, status, isOwner }: { periodId: string; status: string; isOwner: boolean }) {
  const router = useRouter();
  const [checks, setChecks] = React.useState<CloseCheck[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [ack, setAck] = React.useState("");
  const [confirm, setConfirm] = React.useState<null | "reopen" | "lock" | "unlock">(null);

  const blocking = checks?.filter((c) => c.severity === "blocking") ?? [];
  const warnings = checks?.filter((c) => c.severity === "warning") ?? [];

  async function run() {
    setBusy(true);
    const res = await runPeriodChecks(periodId);
    setBusy(false);
    if (res.ok && res.checks) setChecks(res.checks);
    else toast.error(res.error ?? "Failed to run checks.");
  }
  async function doClose() {
    setBusy(true);
    const res = await closePeriod(periodId, warnings.length > 0, ack || undefined);
    setBusy(false);
    if (res.ok) { toast.success("Period closed."); router.refresh(); } else toast.error(res.error ?? "Failed.");
  }
  async function onConfirm(reason: string) {
    const fn = confirm === "reopen" ? reopenPeriod : confirm === "lock" ? lockPeriod : unlockPeriod;
    const res = await fn(periodId, reason);
    if (!res.ok) return res.error ?? "Failed.";
    toast.success("Done."); router.refresh();
  }

  const Icon = ({ s }: { s: string }) => s === "passed" ? <CheckCircle2 className="h-4 w-4 text-success" /> : s === "warning" ? <AlertTriangle className="h-4 w-4 text-warning-foreground" /> : <XCircle className="h-4 w-4 text-destructive" />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status === "open" && <Button size="sm" variant="outline" onClick={run} disabled={busy}>Run close checklist</Button>}
        {status === "open" && checks && blocking.length === 0 && <Button size="sm" onClick={doClose} disabled={busy}>Close period</Button>}
        {status === "closed" && isOwner && <Button size="sm" variant="outline" onClick={() => setConfirm("reopen")}>Reopen</Button>}
        {status === "closed" && <Button size="sm" variant="outline" onClick={() => setConfirm("lock")}>Lock</Button>}
        {status === "locked" && isOwner && <Button size="sm" variant="outline" onClick={() => setConfirm("unlock")}>Unlock</Button>}
      </div>

      {checks && (
        <Card><CardContent className="space-y-1.5 p-4 text-sm">
          {checks.map((c) => (
            <div key={c.key} className="flex items-center justify-between">
              <span className="flex items-center gap-2"><Icon s={c.severity} /> {c.label}</span>
              <span className="text-muted-foreground">{c.detail}</span>
            </div>
          ))}
          {blocking.length > 0 && <p className="pt-2 text-destructive">{blocking.length} blocking issue(s) must be resolved before closing.</p>}
          {blocking.length === 0 && warnings.length > 0 && (
            <div className="pt-2">
              <p className="text-warning-foreground">{warnings.length} warning(s). Provide an explanation to close:</p>
              <Textarea value={ack} onChange={(e) => setAck(e.target.value)} placeholder="Explanation (stored in the audit trail)" className="mt-1" />
            </div>
          )}
        </CardContent></Card>
      )}

      <ConfirmDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "reopen" ? "Reopen this period?" : confirm === "lock" ? "Lock this period?" : "Unlock this period?"}
        description={confirm === "unlock" ? "Unlocking a locked period is a strong action and is recorded in the audit trail." : "This is recorded in the audit trail."}
        confirmLabel={confirm === "lock" ? "Lock" : confirm === "reopen" ? "Reopen" : "Unlock"} destructive requireReason onConfirm={onConfirm} />
    </div>
  );
}
