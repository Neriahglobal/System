/**
 * Phase 2 calculation tests (pure, no DB). Run with `npm test`.
 * Covers the sale/tax math that the post_sale() database function mirrors, plus
 * the weighted-average costing formula used by record_stock_movement().
 */
import assert from "node:assert/strict";
import { calcLine, calcTotals, round2 } from "../src/lib/sales/calc";

let passed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`  FAIL ${name}\n       ${(e as Error).message}`); process.exitCode = 1; }
}

// Tax-exclusive
test("tax-exclusive 18% on 1000", () => {
  const r = calcLine({ quantity: 1, unitPrice: 1000, discount: 0, taxRate: 18, taxInclusive: false });
  assert.equal(r.net, 1000); assert.equal(r.tax, 180); assert.equal(r.lineTotal, 1180);
});

// Tax-inclusive
test("tax-inclusive 18% on 1180", () => {
  const r = calcLine({ quantity: 1, unitPrice: 1180, discount: 0, taxRate: 18, taxInclusive: true });
  assert.equal(r.net, 1000); assert.equal(r.tax, 180); assert.equal(r.lineTotal, 1180);
});

// Zero-rated
test("zero-rated has no tax", () => {
  const r = calcLine({ quantity: 3, unitPrice: 500, discount: 0, taxRate: 0, taxInclusive: false });
  assert.equal(r.tax, 0); assert.equal(r.lineTotal, 1500);
});

// Discount
test("line discount reduces base before tax", () => {
  const r = calcLine({ quantity: 2, unitPrice: 1000, discount: 200, taxRate: 18, taxInclusive: false });
  assert.equal(r.base, 1800); assert.equal(r.tax, 324); assert.equal(r.lineTotal, 2124);
});

// Totals
test("totals aggregate lines", () => {
  const t = calcTotals([
    { quantity: 1, unitPrice: 1000, discount: 0, taxRate: 18, taxInclusive: false },
    { quantity: 2, unitPrice: 500, discount: 0, taxRate: 0, taxInclusive: false },
  ]);
  assert.equal(t.net, 2000); assert.equal(t.tax, 180); assert.equal(t.grand, 2180);
});

// Weighted-average costing (mirrors record_stock_movement)
function avgIn(oldQty: number, oldVal: number, inQty: number, inCost: number) {
  const val = round2(oldVal + inQty * inCost);
  const qty = oldQty + inQty;
  return { qty, val, avg: qty > 0 ? round2(val / qty) : 0 };
}
test("weighted-average of two receipts", () => {
  let s = avgIn(0, 0, 10, 100);      // 10 @ 100
  assert.equal(s.avg, 100);
  s = avgIn(s.qty, s.val, 10, 120);  // + 10 @ 120 => avg 110
  assert.equal(s.avg, 110);
  assert.equal(s.val, 2200);
});
test("outgoing uses average, average unchanged", () => {
  const s = avgIn(0, 0, 10, 110);
  const outQty = 4; const outCost = s.avg;
  const remainingVal = round2(s.val - outQty * outCost);
  assert.equal(outCost, 110);
  assert.equal(remainingVal, 660); // 6 * 110
});

console.log(`\n${passed} checks passed.`);
