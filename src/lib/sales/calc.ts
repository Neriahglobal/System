/**
 * Line and tax math for sales/returns. Pure, shared by the browser (live
 * preview) and mirrored authoritatively by the post_sale() database function.
 * Money rounds to 2dp at line level.
 */

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface LineInput {
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number; // percent
  taxInclusive: boolean;
}

export interface LineResult {
  gross: number; // qty * price (before discount)
  base: number; // after discount
  net: number;
  tax: number;
  lineTotal: number;
}

export function calcLine(l: LineInput): LineResult {
  const gross = round2(l.quantity * l.unitPrice);
  const base = round2(gross - l.discount);
  let net: number;
  let tax: number;
  let lineTotal: number;
  if (l.taxInclusive && l.taxRate > 0) {
    net = round2(base / (1 + l.taxRate / 100));
    tax = round2(base - net);
    lineTotal = base;
  } else {
    net = base;
    tax = round2(base * (l.taxRate / 100));
    lineTotal = round2(net + tax);
  }
  return { gross, base, net, tax, lineTotal };
}

export interface Totals {
  subtotal: number;
  discount: number;
  net: number;
  tax: number;
  grand: number;
}

export function calcTotals(lines: LineInput[]): Totals {
  let subtotal = 0;
  let discount = 0;
  let net = 0;
  let tax = 0;
  let grand = 0;
  for (const l of lines) {
    const r = calcLine(l);
    subtotal = round2(subtotal + r.gross);
    discount = round2(discount + l.discount);
    net = round2(net + r.net);
    tax = round2(tax + r.tax);
    grand = round2(grand + r.lineTotal);
  }
  return { subtotal, discount, net, tax, grand };
}
