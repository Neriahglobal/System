"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { assertActiveUser, assertPermission, assertBranchAccess } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import { getActiveContext } from "@/lib/context";
import { callPostingRpc, type RpcResult } from "@/lib/rpc";
import { round2 } from "@/lib/sales/calc";

export interface OtherIncomeDraftInput {
  incomeId?: string;
  branchId: string;
  incomeTypeId: string;
  receivedFrom?: string;
  description?: string;
  documentDate: string;
  taxCodeId?: string | null;
  amount: number; // gross if inclusive else net
  reference?: string;
  notes?: string;
  receipts: { payment_account_id: string; amount: number; reference?: string }[];
}

export async function saveOtherIncomeDraft(input: OtherIncomeDraftInput): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, input.incomeId ? "other_income.edit_draft" : "other_income.create");
    const ctx = await getActiveContext();
    assertBranchAccess(user, input.branchId);
    if (!(input.amount > 0)) return { ok: false, error: "Amount must be greater than zero." };

    const admin = createAdminClient();
    const { data: it } = await admin.from("other_income_types").select("id, company_id").eq("id", input.incomeTypeId).maybeSingle();
    if (!it || it.company_id !== ctx.companyId) return { ok: false, error: "Invalid income type." };

    let rate = 0, inclusive = false, taxName: string | null = null;
    if (input.taxCodeId) {
      const { data: tc } = await admin.from("tax_codes").select("rate, is_inclusive, name, company_id").eq("id", input.taxCodeId).maybeSingle();
      if (!tc || tc.company_id !== ctx.companyId) return { ok: false, error: "Invalid tax code." };
      rate = Number(tc.rate); inclusive = tc.is_inclusive; taxName = tc.name;
    }
    let net: number, tax: number, grand: number;
    if (inclusive && rate > 0) { grand = round2(input.amount); net = round2(grand / (1 + rate / 100)); tax = round2(grand - net); }
    else { net = round2(input.amount); tax = round2(net * rate / 100); grand = round2(net + tax); }

    const recv = round2(input.receipts.reduce((s, r) => s + (r.amount || 0), 0));
    if (recv !== grand) return { ok: false, error: "Receipts must equal the gross income amount (fully received)." };

    const header = {
      company_id: ctx.companyId, branch_id: input.branchId, income_type_id: input.incomeTypeId,
      received_from: input.receivedFrom || null, description: input.description || null, document_date: input.documentDate,
      tax_code_id: input.taxCodeId || null, tax_rate: rate, tax_name: taxName, tax_inclusive: inclusive,
      net_total: net, tax_total: tax, grand_total: grand, reference: input.reference || null, notes: input.notes || null, updated_by: user.id,
    };

    let id = input.incomeId ?? null;
    if (id) {
      const { data: ex } = await admin.from("other_income_transactions").select("document_status, company_id").eq("id", id).maybeSingle();
      if (!ex || ex.company_id !== ctx.companyId) return { ok: false, error: "Not found." };
      if (ex.document_status !== "draft") return { ok: false, error: "Only drafts can be edited." };
      const { error } = await admin.from("other_income_transactions").update(header).eq("id", id);
      if (error) return { ok: false, error: error.message };
      await admin.from("other_income_receipts").delete().eq("transaction_id", id);
    } else {
      const { data, error } = await admin.from("other_income_transactions").insert({ ...header, created_by: user.id }).select("id").single();
      if (error) return { ok: false, error: error.message };
      id = data.id;
    }
    await admin.from("other_income_receipts").insert(input.receipts.filter((r) => r.amount > 0).map((r) => ({
      transaction_id: id, payment_account_id: r.payment_account_id, amount: r.amount, reference: r.reference || null,
    })));
    await writeAuditLog({ userId: user.id, companyId: ctx.companyId, branchId: input.branchId, action: input.incomeId ? "other_income.draft_edit" : "other_income.draft_create", resourceType: "other_income", resourceId: id! });
    revalidatePath("/other-income/history");
    return { ok: true, id: id! };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}

export async function postOtherIncome(id: string): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "other_income.post");
    const ctx = await getActiveContext();
    const admin = createAdminClient();
    const { data: oi } = await admin.from("other_income_transactions").select("branch_id, company_id").eq("id", id).maybeSingle();
    if (!oi || oi.company_id !== ctx.companyId) return { ok: false, error: "Not found." };
    assertBranchAccess(user, oi.branch_id);
    const res = await callPostingRpc("post_other_income", { p_id: id, p_user: user.id, p_idem: randomUUID() });
    if (res.ok) {
      await writeAuditLog({ userId: user.id, companyId: ctx.companyId, branchId: oi.branch_id, action: "other_income.post", resourceType: "other_income", resourceId: id });
      ["/other-income/history", `/other-income/${id}`, "/dashboard", "/cash-and-banks"].forEach((p) => revalidatePath(p));
    }
    return res;
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}

export async function deleteOtherIncomeDraft(id: string, reason: string): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "transactions.delete_draft");
    const admin = createAdminClient();
    const { data } = await admin.from("other_income_transactions").select("document_status").eq("id", id).maybeSingle();
    if (!data || data.document_status !== "draft") return { ok: false, error: "Only drafts can be deleted." };
    const { error } = await admin.from("other_income_transactions").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    await writeAuditLog({ userId: user.id, action: "other_income.draft_delete", resourceType: "other_income", resourceId: id, reason });
    revalidatePath("/other-income/history");
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}

export async function voidOtherIncome(id: string, reason: string): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "transactions.void");
    const res = await callPostingRpc("void_other_income", { p_id: id, p_user: user.id, p_reason: reason });
    if (res.ok) {
      await writeAuditLog({ userId: user.id, action: "other_income.void", resourceType: "other_income", resourceId: id, reason });
      ["/other-income/history", `/other-income/${id}`, "/dashboard", "/cash-and-banks"].forEach((p) => revalidatePath(p));
    }
    return res;
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}
