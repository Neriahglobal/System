"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { createAndPostSupplierPayment } from "@/lib/purchases/actions";
import { round2 } from "@/lib/sales/calc";
import { formatMoney, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface Payable { payable_id: string; label: string; date: string; outstanding: number }
export interface SupplierWithPayables { id: string; code: string; name: string; payables: Payable[] }
export interface AccountOpt { id: string; name: string }
interface Funding { key: string; payment_account_id: string; amount: string }

export function SupplierPaymentForm({ branchId, suppliers, accounts, initialSupplierId }: {
  branchId: string; suppliers: SupplierWithPayables[]; accounts: AccountOpt[]; initialSupplierId?: string;
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = React.useState(initialSupplierId ?? "");
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = React.useState("");
  const [alloc, setAlloc] = React.useState<Record<string, string>>({});
  const [funding, setFunding] = React.useState<Funding[]>([{ key: "f1", payment_account_id: accounts[0]?.id ?? "", amount: "" }]);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const supplier = suppliers.find((s) => s.id === supplierId);
  const allocTotal = round2((supplier?.payables ?? []).reduce((s, p) => s + Number(alloc[p.payable_id] || 0), 0));
  const fundTotal = round2(funding.reduce((s, f) => s + Number(f.amount || 0), 0));

  async function submit() {
    setError(null);
    if (!supplierId) { setError("Select a supplier."); return; }
    if (allocTotal <= 0) { setError("Allocate to at least one invoice."); return; }
    if (fundTotal !== allocTotal) { setError("Funding must equal the total allocated (no supplier advance)."); return; }
    const allocations = (supplier?.payables ?? []).map((p) => ({ payable_id: p.payable_id, amount: Number(alloc[p.payable_id] || 0) })).filter((a) => a.amount > 0);
    const fund = funding.filter((f) => f.payment_account_id && Number(f.amount) > 0).map((f) => ({ payment_account_id: f.payment_account_id, amount: Number(f.amount) }));
    setPending(true);
    const res = await createAndPostSupplierPayment({ branchId, supplierId, documentDate: date, reference, funding: fund, allocations });
    setPending(false);
    if (res.ok) { toast.success("Supplier payment recorded."); router.push("/purchases/supplier-payments"); }
    else setError(res.error ?? "Failed.");
  }

  return (
    <div className="space-y-4">
      <Card><CardContent className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
        <div className="space-y-1.5"><Label>Supplier</Label>
          <Select value={supplierId} onValueChange={(v) => { setSupplierId(v); setAlloc({}); }}>
            <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
            <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>)}</SelectContent>
          </Select></div>
        <div className="space-y-1.5"><Label>Payment date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Reference</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} /></div>
      </CardContent></Card>

      {supplier ? (supplier.payables.length === 0 ? <EmptyState title="Nothing outstanding for this supplier" /> : (
        <Card><CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr>
              <th className="px-3 py-2 text-left">Document</th><th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-right">Outstanding</th><th className="px-3 py-2 text-right">Allocate</th>
            </tr></thead>
            <tbody>
              {supplier.payables.map((p) => (
                <tr key={p.payable_id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">{p.label}</td>
                  <td className="px-3 py-2">{formatDate(p.date)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(p.outstanding)}</td>
                  <td className="px-3 py-2 text-right"><Input className="h-8 w-32 text-right tabular-nums" type="number" min="0" max={p.outstanding} step="0.01" value={alloc[p.payable_id] ?? ""} onChange={(e) => setAlloc({ ...alloc, [p.payable_id]: e.target.value })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      )) : <p className="text-sm text-muted-foreground">Select a supplier to see outstanding documents.</p>}

      <Card><CardContent className="p-5">
        <div className="mb-2 flex items-center justify-between"><Label>Funding accounts</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => setFunding([...funding, { key: Math.random().toString(36).slice(2), payment_account_id: "", amount: "" }])}><Plus className="h-4 w-4" /> Add</Button>
        </div>
        <div className="space-y-2">
          {funding.map((f) => (
            <div key={f.key} className="flex items-center gap-2">
              <Select value={f.payment_account_id} onValueChange={(v) => setFunding(funding.map((x) => x.key === f.key ? { ...x, payment_account_id: v } : x))}>
                <SelectTrigger className="h-8 flex-1"><SelectValue placeholder="Account" /></SelectTrigger>
                <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input className="h-8 w-32 text-right tabular-nums" type="number" min="0" step="0.01" value={f.amount} onChange={(e) => setFunding(funding.map((x) => x.key === f.key ? { ...x, amount: e.target.value } : x))} />
              <button type="button" onClick={() => setFunding(funding.filter((x) => x.key !== f.key))} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      </CardContent></Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Allocated: <span className="font-semibold text-foreground tabular-nums">{formatMoney(allocTotal)}</span> · Funding: <span className="tabular-nums">{formatMoney(fundTotal)}</span></p>
        <div className="flex items-center gap-2">
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <Button variant="outline" onClick={() => router.push("/purchases/supplier-payments")} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending}>{pending ? "Working..." : "Record payment"}</Button>
        </div>
      </div>
    </div>
  );
}
