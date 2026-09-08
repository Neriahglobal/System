"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { assertActiveUser, assertPermission, assertBranchAccess } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import { getActiveContext } from "@/lib/context";
import { callPostingRpc, type RpcResult } from "@/lib/rpc";
import { calcLine, calcTotals, round2 } from "@/lib/sales/calc";

export interface PurchaseLineInput { product_id: string; quantity: number; unit_cost: number; discount: number; tax_code_id?: string | null }
export interface PurchasePaymentInput { payment_account_id: string; amount: number; reference?: string }
export interface PurchaseDraftInput {
  purchaseId?: string;
  branchId: string;
  supplierId: string;
  documentDate: string;
  supplierInvoiceDate?: string | null;
  supplierInvoiceNumber?: string;
  internalReference?: string;
  dueDate?: string | null;
  notes?: string;
  lines: PurchaseLineInput[];
  payments: PurchasePaymentInput[];
}

export async function savePurchaseDraft(input: PurchaseDraftInput): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, input.purchaseId ? "purchases.edit_draft" : "purchases.create");
    const ctx = await getActiveContext();
    assertBranchAccess(user, input.branchId);
    if (input.lines.length === 0) return { ok: false, error: "Add at least one product line." };

    const admin = createAdminClient();
    const productIds = input.lines.map((l) => l.product_id);
    const { data: products } = await admin.from("products")
      .select("id, name, sku, tax_code_id, track_inventory, is_active, company_id").in("id", productIds);
    const pMap = new Map((products ?? []).map((p) => [p.id, p]));
    const taxIds = Array.from(new Set([
      ...input.lines.map((l) => l.tax_code_id).filter(Boolean) as string[],
      ...(products ?? []).map((p) => p.tax_code_id).filter(Boolean) as string[],
    ]));
    const { data: taxCodes } = await admin.from("tax_codes")
      .select("id, name, tax_type, rate, is_inclusive, is_recoverable, company_id")
      .in("id", taxIds.length ? taxIds : ["00000000-0000-0000-0000-000000000000"]);
    const tMap = new Map((taxCodes ?? []).map((t) => [t.id, t]));

    const lineRows: Record<string, unknown>[] = [];
    input.lines.forEach((l, i) => {
      const p = pMap.get(l.product_id);
      if (!p) throw new Error("A selected product is invalid.");
      if (p.company_id !== ctx.companyId) throw new Error("A product belongs to another company.");
      if (!p.is_active) throw new Error(`Product ${p.sku} is inactive.`);
      if (!(l.quantity > 0)) throw new Error("Quantity must be greater than zero.");
      if (l.unit_cost < 0) throw new Error("Unit cost cannot be negative.");
      const taxId = l.tax_code_id ?? p.tax_code_id ?? null;
      const tc = taxId ? tMap.get(taxId) : null;
      if (taxId && tc && tc.company_id !== ctx.companyId) throw new Error("Tax code belongs to another company.");
      const rate = tc ? Number(tc.rate) : 0;
      const inclusive = tc ? tc.is_inclusive : false;
      const recoverable = tc ? tc.is_recoverable : true;
      const r = calcLine({ quantity: l.quantity, unitPrice: l.unit_cost, discount: l.discount, taxRate: rate, taxInclusive: inclusive });
      if (r.base < 0) throw new Error("Discount exceeds the line value.");
      const nonrec = recoverable ? 0 : r.tax;
      const invVal = p.track_inventory ? round2(r.net + nonrec) : 0;
      lineRows.push({
        product_id: l.product_id, description: p.name, quantity: l.quantity, unit_cost: l.unit_cost,
        discount: l.discount, tax_code_id: taxId, tax_rate: rate, tax_type: tc?.tax_type ?? null,
        tax_name: tc?.name ?? null, tax_inclusive: inclusive, is_recoverable: recoverable,
        net_amount: r.net, tax_amount: r.tax, recoverable_tax: recoverable ? r.tax : 0, nonrecoverable_tax: nonrec,
        gross_amount: r.lineTotal, inventory_unit_cost: p.track_inventory && l.quantity > 0 ? round2(invVal / l.quantity) : 0,
        inventory_value: invVal, track_inventory: p.track_inventory, line_no: i + 1,
      });
    });

    const totals = calcTotals(input.lines.map((l) => {
      const p = pMap.get(l.product_id)!;
      const taxId = l.tax_code_id ?? p.tax_code_id ?? null;
      const tc = taxId ? tMap.get(taxId) : null;
      return { quantity: l.quantity, unitPrice: l.unit_cost, discount: l.discount, taxRate: tc ? Number(tc.rate) : 0, taxInclusive: tc ? tc.is_inclusive : false };
    }));
    const paid = round2(input.payments.reduce((s, p) => s + (p.amount || 0), 0));
    if (paid > totals.grand + 0.001) return { ok: false, error: "Payments exceed the purchase total." };
    const outstanding = round2(totals.grand - paid);

    const header = {
      company_id: ctx.companyId, branch_id: input.branchId, supplier_id: input.supplierId,
      document_date: input.documentDate, supplier_invoice_date: input.supplierInvoiceDate || null,
      supplier_invoice_number: input.supplierInvoiceNumber || null,
      internal_reference: input.internalReference || null, due_date: input.dueDate || null,
      notes: input.notes || null, is_credit: outstanding > 0,
      subtotal: totals.subtotal, discount_total: totals.discount, net_total: totals.net, tax_total: totals.tax,
      grand_total: totals.grand, amount_paid: paid, outstanding,
      payment_status: paid <= 0 ? "unpaid" : paid < totals.grand ? "partially_paid" : "paid",
      updated_by: user.id,
    };

    let id = input.purchaseId ?? null;
    if (id) {
      const { data: ex } = await admin.from("purchases").select("document_status, company_id").eq("id", id).maybeSingle();
      if (!ex || ex.company_id !== ctx.companyId) return { ok: false, error: "Purchase not found." };
      if (ex.document_status !== "draft") return { ok: false, error: "Only drafts can be edited." };
      const { error } = await admin.from("purchases").update(header).eq("id", id);
      if (error) return { ok: false, error: error.message };
      await admin.from("purchase_lines").delete().eq("purchase_id", id);
      await admin.from("purchase_payments").delete().eq("purchase_id", id);
    } else {
      const { data, error } = await admin.from("purchases").insert({ ...header, created_by: user.id }).select("id").single();
      if (error) return { ok: false, error: error.message };
      id = data.id;
    }
    await admin.from("purchase_lines").insert(lineRows.map((r) => ({ ...r, purchase_id: id })));
    if (input.payments.length) {
      await admin.from("purchase_payments").insert(input.payments.filter((p) => p.amount > 0).map((p) => ({
        purchase_id: id, payment_account_id: p.payment_account_id, amount: p.amount, reference: p.reference || null, payment_date: input.documentDate,
      })));
    }
    await writeAuditLog({ userId: user.id, companyId: ctx.companyId, branchId: input.branchId, action: input.purchaseId ? "purchase.draft_edit" : "purchase.draft_create", resourceType: "purchase", resourceId: id! });
    revalidatePath("/purchases/history");
    return { ok: true, id: id! };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed." };
  }
}

export async function postPurchase(id: string): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "purchases.post");
    const ctx = await getActiveContext();
    const admin = createAdminClient();
    const { data: pur } = await admin.from("purchases").select("branch_id, company_id, document_status").eq("id", id).maybeSingle();
    if (!pur || pur.company_id !== ctx.companyId) return { ok: false, error: "Purchase not found." };
    assertBranchAccess(user, pur.branch_id);
    const res = await callPostingRpc("post_purchase", { p_id: id, p_user: user.id, p_idem: randomUUID() });
    if (res.ok) {
      await writeAuditLog({ userId: user.id, companyId: ctx.companyId, branchId: pur.branch_id, action: "purchase.post", resourceType: "purchase", resourceId: id });
      ["/purchases/history", `/purchases/${id}`, "/inventory", "/dashboard", "/cash-and-banks"].forEach((p) => revalidatePath(p));
    }
    return res;
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}

export async function deletePurchaseDraft(id: string, reason: string): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "transactions.delete_draft");
    const admin = createAdminClient();
    const { data } = await admin.from("purchases").select("document_status").eq("id", id).maybeSingle();
    if (!data) return { ok: false, error: "Not found." };
    if (data.document_status !== "draft") return { ok: false, error: "Only drafts can be deleted." };
    const { error } = await admin.from("purchases").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    await writeAuditLog({ userId: user.id, action: "purchase.draft_delete", resourceType: "purchase", resourceId: id, reason });
    revalidatePath("/purchases/history");
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}

export async function voidPurchase(id: string, reason: string): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "transactions.void");
    const res = await callPostingRpc("void_purchase", { p_id: id, p_user: user.id, p_reason: reason });
    if (res.ok) {
      await writeAuditLog({ userId: user.id, action: "purchase.void", resourceType: "purchase", resourceId: id, reason });
      ["/purchases/history", `/purchases/${id}`, "/inventory", "/dashboard", "/cash-and-banks"].forEach((p) => revalidatePath(p));
    }
    return res;
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}

/* --------------------------- Purchase returns --------------------------- */
export async function createAndPostPurchaseReturn(input: {
  purchaseId: string; returnDate: string; reason: string; notes?: string;
  settlementMethod: "reduce_payable" | "supplier_credit" | "refund" | "mixed";
  lines: { purchase_line_id: string; quantity: number }[];
  settlements: { payment_account_id: string; amount: number }[];
}): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "purchases.create_return");
    const ctx = await getActiveContext();
    if (!input.reason?.trim()) return { ok: false, error: "A reason is required." };
    if (input.lines.length === 0) return { ok: false, error: "Select at least one line." };
    const admin = createAdminClient();
    const { data: pur } = await admin.from("purchases").select("*").eq("id", input.purchaseId).maybeSingle();
    if (!pur || pur.company_id !== ctx.companyId) return { ok: false, error: "Purchase not found." };
    if (pur.document_status !== "posted") return { ok: false, error: "Returns require a posted purchase." };
    assertBranchAccess(user, pur.branch_id);

    const { data: pLines } = await admin.from("purchase_lines").select("*").eq("purchase_id", input.purchaseId);
    const map = new Map((pLines ?? []).map((l) => [l.id, l]));
    const retLines = input.lines.map((rl, i) => {
      const pl = map.get(rl.purchase_line_id);
      if (!pl) throw new Error("Invalid return line.");
      if (!(rl.quantity > 0)) throw new Error("Return quantity must be greater than zero.");
      const frac = rl.quantity / Number(pl.quantity);
      return {
        purchase_line_id: pl.id, product_id: pl.product_id, quantity: rl.quantity,
        unit_price: pl.unit_cost, tax_rate: pl.tax_rate, is_recoverable: pl.is_recoverable,
        net_amount: round2(Number(pl.net_amount) * frac), tax_amount: round2(Number(pl.tax_amount) * frac),
        line_total: round2(Number(pl.gross_amount) * frac), track_inventory: pl.track_inventory, line_no: i + 1,
      };
    });

    const { data: head, error } = await admin.from("purchase_returns").insert({
      company_id: ctx.companyId, branch_id: pur.branch_id, purchase_id: input.purchaseId, supplier_id: pur.supplier_id,
      document_date: input.returnDate, reason: input.reason, notes: input.notes || null, settlement_method: input.settlementMethod,
      created_by: user.id, updated_by: user.id,
    }).select("id").single();
    if (error) return { ok: false, error: error.message };
    const returnId = head.id;
    await admin.from("purchase_return_lines").insert(retLines.map((l) => ({ ...l, return_id: returnId })));
    if (input.settlements.length) {
      await admin.from("purchase_return_settlements").insert(input.settlements.filter((s) => s.amount > 0).map((s) => ({
        return_id: returnId, payment_account_id: s.payment_account_id, amount: s.amount,
      })));
    }
    const res = await callPostingRpc("post_purchase_return", { p_id: returnId, p_user: user.id, p_idem: randomUUID() });
    if (res.ok) {
      await writeAuditLog({ userId: user.id, companyId: ctx.companyId, branchId: pur.branch_id, action: "purchase.return_post", resourceType: "purchase_return", resourceId: returnId });
      ["/purchases/history", `/purchases/${input.purchaseId}`, "/inventory", "/dashboard"].forEach((p) => revalidatePath(p));
    } else {
      await admin.from("purchase_returns").delete().eq("id", returnId);
    }
    return res;
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}

export async function voidPurchaseReturn(id: string, reason: string): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "transactions.void");
    const res = await callPostingRpc("void_purchase_return", { p_id: id, p_user: user.id, p_reason: reason });
    if (res.ok) {
      await writeAuditLog({ userId: user.id, action: "purchase.return_void", resourceType: "purchase_return", resourceId: id, reason });
      ["/purchases/history", "/inventory", "/dashboard"].forEach((p) => revalidatePath(p));
    }
    return res;
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}

/* -------------------------- Supplier payments --------------------------- */
export async function createAndPostSupplierPayment(input: {
  branchId: string; supplierId: string; documentDate: string; reference?: string; notes?: string;
  funding: { payment_account_id: string; amount: number; reference?: string }[];
  allocations: { payable_id: string; amount: number }[];
}): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "purchases.record_payment");
    const ctx = await getActiveContext();
    assertBranchAccess(user, input.branchId);
    const fund = round2(input.funding.reduce((s, f) => s + (f.amount || 0), 0));
    const alloc = round2(input.allocations.reduce((s, a) => s + (a.amount || 0), 0));
    if (fund <= 0) return { ok: false, error: "Enter a payment amount." };
    if (fund !== alloc) return { ok: false, error: "Funding must equal the total allocated to invoices (no supplier advance)." };

    const admin = createAdminClient();
    const { data: head, error } = await admin.from("supplier_payments").insert({
      company_id: ctx.companyId, branch_id: input.branchId, supplier_id: input.supplierId,
      document_date: input.documentDate, reference: input.reference || null, notes: input.notes || null, created_by: user.id,
    }).select("id").single();
    if (error) return { ok: false, error: error.message };
    const pid = head.id;
    await admin.from("supplier_payment_funding").insert(input.funding.filter((f) => f.amount > 0).map((f) => ({
      payment_id: pid, payment_account_id: f.payment_account_id, amount: f.amount, reference: f.reference || null,
    })));
    await admin.from("supplier_payment_allocations").insert(input.allocations.filter((a) => a.amount > 0).map((a) => ({
      payment_id: pid, payable_id: a.payable_id, amount: a.amount,
    })));
    const res = await callPostingRpc("post_supplier_payment", { p_id: pid, p_user: user.id, p_idem: randomUUID() });
    if (res.ok) {
      await writeAuditLog({ userId: user.id, companyId: ctx.companyId, branchId: input.branchId, action: "supplier_payment.post", resourceType: "supplier_payment", resourceId: pid });
      ["/purchases/supplier-payments", "/purchases/history", "/dashboard", "/cash-and-banks"].forEach((p) => revalidatePath(p));
    } else {
      await admin.from("supplier_payments").delete().eq("id", pid);
    }
    return res;
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}

export async function voidSupplierPayment(id: string, reason: string): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "transactions.void");
    const res = await callPostingRpc("void_supplier_payment", { p_id: id, p_user: user.id, p_reason: reason });
    if (res.ok) {
      await writeAuditLog({ userId: user.id, action: "supplier_payment.void", resourceType: "supplier_payment", resourceId: id, reason });
      ["/purchases/supplier-payments", "/purchases/history", "/dashboard", "/cash-and-banks"].forEach((p) => revalidatePath(p));
    }
    return res;
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}
