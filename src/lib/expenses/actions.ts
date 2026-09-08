"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { assertActiveUser, assertPermission, assertBranchAccess } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import { getActiveContext } from "@/lib/context";
import { callPostingRpc, type RpcResult } from "@/lib/rpc";
import { round2 } from "@/lib/sales/calc";

export interface ExpenseDraftInput {
  expenseId?: string;
  branchId: string;
  categoryId: string;
  supplierId?: string | null;
  documentDate: string;
  reference?: string;
  description?: string;
  taxCodeId?: string | null;
  amount: number; // treated as gross if the tax code is inclusive, else net
  dueDate?: string | null;
  payments: { payment_account_id: string; amount: number; reference?: string }[];
}

export async function saveExpenseDraft(input: ExpenseDraftInput): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, input.expenseId ? "expenses.edit_draft" : "expenses.create");
    const ctx = await getActiveContext();
    assertBranchAccess(user, input.branchId);
    if (!(input.amount > 0)) return { ok: false, error: "Amount must be greater than zero." };

    const admin = createAdminClient();
    const { data: cat } = await admin.from("expense_categories").select("id, company_id, is_active").eq("id", input.categoryId).maybeSingle();
    if (!cat || cat.company_id !== ctx.companyId) return { ok: false, error: "Invalid expense category." };

    let rate = 0, inclusive = false, recoverable = true, taxName: string | null = null;
    if (input.taxCodeId) {
      const { data: tc } = await admin.from("tax_codes").select("rate, is_inclusive, is_recoverable, name, company_id").eq("id", input.taxCodeId).maybeSingle();
      if (!tc || tc.company_id !== ctx.companyId) return { ok: false, error: "Invalid tax code." };
      rate = Number(tc.rate); inclusive = tc.is_inclusive; recoverable = tc.is_recoverable; taxName = tc.name;
    }
    let net: number, tax: number, grand: number;
    if (inclusive && rate > 0) { grand = round2(input.amount); net = round2(grand / (1 + rate / 100)); tax = round2(grand - net); }
    else { net = round2(input.amount); tax = round2(net * rate / 100); grand = round2(net + tax); }

    const paid = round2(input.payments.reduce((s, p) => s + (p.amount || 0), 0));
    if (paid > grand + 0.001) return { ok: false, error: "Payments exceed the expense total." };
    const outstanding = round2(grand - paid);
    if (outstanding > 0 && !input.supplierId) return { ok: false, error: "A credit expense requires a supplier/payee." };

    const header = {
      company_id: ctx.companyId, branch_id: input.branchId, expense_category_id: input.categoryId,
      supplier_id: input.supplierId || null, document_date: input.documentDate, reference: input.reference || null,
      description: input.description || null, tax_code_id: input.taxCodeId || null, tax_rate: rate, tax_name: taxName,
      tax_inclusive: inclusive, is_recoverable: recoverable, net_total: net, tax_total: tax, grand_total: grand,
      amount_paid: paid, outstanding, due_date: input.dueDate || null, is_credit: outstanding > 0,
      payment_status: paid <= 0 ? "unpaid" : paid < grand ? "partially_paid" : "paid", updated_by: user.id,
    };

    let id = input.expenseId ?? null;
    if (id) {
      const { data: ex } = await admin.from("expenses").select("document_status, company_id").eq("id", id).maybeSingle();
      if (!ex || ex.company_id !== ctx.companyId) return { ok: false, error: "Expense not found." };
      if (ex.document_status !== "draft") return { ok: false, error: "Only drafts can be edited." };
      const { error } = await admin.from("expenses").update(header).eq("id", id);
      if (error) return { ok: false, error: error.message };
      await admin.from("expense_payments").delete().eq("expense_id", id);
    } else {
      const { data, error } = await admin.from("expenses").insert({ ...header, created_by: user.id }).select("id").single();
      if (error) return { ok: false, error: error.message };
      id = data.id;
    }
    if (input.payments.length) {
      await admin.from("expense_payments").insert(input.payments.filter((p) => p.amount > 0).map((p) => ({
        expense_id: id, payment_account_id: p.payment_account_id, amount: p.amount, reference: p.reference || null, payment_date: input.documentDate,
      })));
    }
    await writeAuditLog({ userId: user.id, companyId: ctx.companyId, branchId: input.branchId, action: input.expenseId ? "expense.draft_edit" : "expense.draft_create", resourceType: "expense", resourceId: id! });
    revalidatePath("/expenses/history");
    return { ok: true, id: id! };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}

export async function postExpense(id: string): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "expenses.post");
    const ctx = await getActiveContext();
    const admin = createAdminClient();
    const { data: ex } = await admin.from("expenses").select("branch_id, company_id").eq("id", id).maybeSingle();
    if (!ex || ex.company_id !== ctx.companyId) return { ok: false, error: "Expense not found." };
    assertBranchAccess(user, ex.branch_id);
    const res = await callPostingRpc("post_expense", { p_id: id, p_user: user.id, p_idem: randomUUID() });
    if (res.ok) {
      await writeAuditLog({ userId: user.id, companyId: ctx.companyId, branchId: ex.branch_id, action: "expense.post", resourceType: "expense", resourceId: id });
      ["/expenses/history", `/expenses/${id}`, "/dashboard", "/cash-and-banks"].forEach((p) => revalidatePath(p));
    }
    return res;
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}

export async function deleteExpenseDraft(id: string, reason: string): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "transactions.delete_draft");
    const admin = createAdminClient();
    const { data } = await admin.from("expenses").select("document_status").eq("id", id).maybeSingle();
    if (!data || data.document_status !== "draft") return { ok: false, error: "Only drafts can be deleted." };
    const { error } = await admin.from("expenses").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    await writeAuditLog({ userId: user.id, action: "expense.draft_delete", resourceType: "expense", resourceId: id, reason });
    revalidatePath("/expenses/history");
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}

export async function voidExpense(id: string, reason: string): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "transactions.void");
    const res = await callPostingRpc("void_expense", { p_id: id, p_user: user.id, p_reason: reason });
    if (res.ok) {
      await writeAuditLog({ userId: user.id, action: "expense.void", resourceType: "expense", resourceId: id, reason });
      ["/expenses/history", `/expenses/${id}`, "/dashboard", "/cash-and-banks"].forEach((p) => revalidatePath(p));
    }
    return res;
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}
