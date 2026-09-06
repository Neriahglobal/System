"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export interface ProductOption {
  id: string;
  sku: string;
  name: string;
  selling_price?: number;
  tax_code_id?: string | null;
  track_inventory?: boolean;
}

export interface StockLine {
  key: string;
  product_id: string;
  quantity: string;
  unit_cost: string;
}

export function newLine(): StockLine {
  return { key: Math.random().toString(36).slice(2), product_id: "", quantity: "", unit_cost: "" };
}

export function StockLineEditor({
  products,
  lines,
  setLines,
  showCost = true,
  qtyLabel = "Quantity",
}: {
  products: ProductOption[];
  lines: StockLine[];
  setLines: (l: StockLine[]) => void;
  showCost?: boolean;
  qtyLabel?: string;
}) {
  function update(key: string, patch: Partial<StockLine>) {
    setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function remove(key: string) {
    setLines(lines.filter((l) => l.key !== key));
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Product</th>
              <th className="px-3 py-2 text-right font-medium">{qtyLabel}</th>
              {showCost && <th className="px-3 py-2 text-right font-medium">Unit cost</th>}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key} className="border-t border-border">
                <td className="px-2 py-1.5">
                  <Select value={l.product_id} onValueChange={(v) => {
                    const p = products.find((x) => x.id === v);
                    update(l.key, { product_id: v, unit_cost: l.unit_cost || (p?.selling_price ? "" : l.unit_cost) });
                  }}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Select product" /></SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.sku} — {p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-2 py-1.5">
                  <Input className="h-8 text-right tabular-nums" type="number" step="0.0001" min="0"
                    value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} />
                </td>
                {showCost && (
                  <td className="px-2 py-1.5">
                    <Input className="h-8 text-right tabular-nums" type="number" step="0.01" min="0"
                      value={l.unit_cost} onChange={(e) => update(l.key, { unit_cost: e.target.value })} />
                  </td>
                )}
                <td className="px-2 py-1.5 text-center">
                  <button type="button" onClick={() => remove(l.key)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr><td colSpan={showCost ? 4 : 3} className="px-3 py-6 text-center text-sm text-muted-foreground">No lines yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, newLine()])}>
        <Plus className="h-4 w-4" /> Add line
      </Button>
    </div>
  );
}
