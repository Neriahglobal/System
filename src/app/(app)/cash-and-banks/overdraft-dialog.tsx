"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";
import { updateOverdraft } from "@/lib/cash/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function OverdraftButton({ account }: { account: { id: string; name: string; allow_negative: boolean; overdraft_limit: number } }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [allow, setAllow] = React.useState(account.allow_negative);
  const [limit, setLimit] = React.useState(String(account.overdraft_limit));
  const [pending, setPending] = React.useState(false);

  async function save() {
    setPending(true);
    const res = await updateOverdraft({ paymentAccountId: account.id, allowNegative: allow, overdraftLimit: Number(limit || 0) });
    setPending(false);
    if (res.ok) { toast.success("Overdraft settings updated."); setOpen(false); router.refresh(); }
    else toast.error(res.error ?? "Failed.");
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-muted-foreground hover:text-foreground" title="Overdraft settings"><Settings2 className="h-4 w-4" /></button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Overdraft — {account.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <div><Label>Allow negative balance</Label><p className="text-xs text-muted-foreground">Only enable for bank accounts with an approved overdraft.</p></div>
              <Switch checked={allow} onCheckedChange={setAllow} />
            </div>
            <div className="space-y-1.5"><Label>Overdraft limit (TZS)</Label><Input type="number" min="0" step="0.01" value={limit} onChange={(e) => setLimit(e.target.value)} disabled={!allow} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button onClick={save} disabled={pending}>{pending ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
