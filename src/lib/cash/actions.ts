"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { assertActiveUser, assertPermission, assertOwner } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import { getActiveContext } from "@/lib/context";
import { callPostingRpc, type RpcResult } from "@/lib/rpc";

/* ------------------------------ Transfers ------------------------------- */
export interface TransferDraftInput {
  transferId?: string;
  sourceAccountId: string;
  destinationAccountId: string;
  transferDate: string;
  amount: number;
  fee: number;
  sourceBranchId?: string | null;
  destinationBranchId?: string | null;
  reference?: string;
  description?: string;
}

export async function saveTransferDraft(input: TransferDraftInput): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, input.transferId ? "cash_transfers.edit_draft" : "cash_transfers.create");
    const ctx = await getActiveContext();
    if (input.sourceAccountId === input.destinationAccountId) return { ok: false, error: "Source and destination must differ." };
    if (!(input.amount > 0)) return { ok: false, error: "Amount must be greater than zero." };
    if (input.fee < 0) return { ok: false, error: "Fee cannot be negative." };

    const admin = createAdminClient();
    const { data: accs } = await admin.from("payment_accounts").select("id, company_id, is_active")
      .in("id", [input.sourceAccountId, input.destinationAccountId]);
    if (!accs || accs.length !== 2 || accs.some((a) => a.company_id !== ctx.companyId || !a.is_active))
      return { ok: false, error: "Both accounts must be active and in your company." };

    const header = {
      company_id: ctx.companyId, source_account_id: input.sourceAccountId, destination_account_id: input.destinationAccountId,
      transfer_date: input.transferDate, amount: input.amount, fee: input.fee,
      source_branch_id: input.sourceBranchId || null, destination_branch_id: input.destinationBranchId || null,
      reference: input.reference || null, description: input.description || null, updated_by: user.id,
    };
    let id = input.transferId ?? null;
    if (id) {
      const { data: ex } = await admin.from("cash_transfers").select("document_status, company_id").eq("id", id).maybeSingle();
      if (!ex || ex.company_id !== ctx.companyId) return { ok: false, error: "Transfer not found." };
      if (ex.document_status !== "draft") return { ok: false, error: "Only drafts can be edited." };
      const { error } = await admin.from("cash_transfers").update(header).eq("id", id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { data, error } = await admin.from("cash_transfers").insert({ ...header, created_by: user.id }).select("id").single();
      if (error) return { ok: false, error: error.message };
      id = data.id;
    }
    await writeAuditLog({ userId: user.id, companyId: ctx.companyId, action: input.transferId ? "cash_transfer.draft_edit" : "cash_transfer.draft_create", resourceType: "cash_transfer", resourceId: id! });
    revalidatePath("/cash-and-banks/transfers");
    return { ok: true, id: id! };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}

export async function postTransfer(id: string): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "cash_transfers.post");
    const res = await callPostingRpc("post_cash_transfer", { p_id: id, p_user: user.id, p_idem: randomUUID() });
    if (res.ok) {
      await writeAuditLog({ userId: user.id, action: "cash_transfer.post", resourceType: "cash_transfer", resourceId: id });
      ["/cash-and-banks", "/cash-and-banks/transfers", `/cash-and-banks/transfers/${id}`, "/dashboard"].forEach((p) => revalidatePath(p));
    }
    return res;
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}

export async function deleteTransferDraft(id: string, reason: string): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "transactions.delete_draft");
    const admin = createAdminClient();
    const { data } = await admin.from("cash_transfers").select("document_status").eq("id", id).maybeSingle();
    if (!data || data.document_status !== "draft") return { ok: false, error: "Only drafts can be deleted." };
    const { error } = await admin.from("cash_transfers").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    await writeAuditLog({ userId: user.id, action: "cash_transfer.draft_delete", resourceType: "cash_transfer", resourceId: id, reason });
    revalidatePath("/cash-and-banks/transfers");
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}

export async function voidTransfer(id: string, reason: string): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "transactions.void");
    const res = await callPostingRpc("void_cash_transfer", { p_id: id, p_user: user.id, p_reason: reason });
    if (res.ok) {
      await writeAuditLog({ userId: user.id, action: "cash_transfer.void", resourceType: "cash_transfer", resourceId: id, reason });
      ["/cash-and-banks", "/cash-and-banks/transfers", `/cash-and-banks/transfers/${id}`, "/dashboard"].forEach((p) => revalidatePath(p));
    }
    return res;
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}

/* ------------------------- Financial openings --------------------------- */
export async function createAndPostFinancialOpening(input: {
  openingDate: string; reference?: string; description?: string;
  lines: { payment_account_id: string; side: "debit" | "credit"; amount: number }[];
}): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "cash_accounts.opening_balance");
    const ctx = await getActiveContext();
    const lines = input.lines.filter((l) => l.payment_account_id && l.amount > 0);
    if (lines.length === 0) return { ok: false, error: "Add at least one opening line." };
    const admin = createAdminClient();
    const { data: head, error } = await admin.from("financial_opening_balances").insert({
      company_id: ctx.companyId, opening_date: input.openingDate, reference: input.reference || null,
      description: input.description || null, created_by: user.id,
    }).select("id").single();
    if (error) return { ok: false, error: error.message };
    const id = head.id;
    await admin.from("financial_opening_balance_lines").insert(lines.map((l, i) => ({
      opening_id: id, payment_account_id: l.payment_account_id, side: l.side, amount: l.amount, line_no: i + 1,
    })));
    const res = await callPostingRpc("post_financial_opening", { p_id: id, p_user: user.id, p_idem: randomUUID() });
    if (res.ok) {
      await writeAuditLog({ userId: user.id, companyId: ctx.companyId, action: "financial_opening.post", resourceType: "financial_opening", resourceId: id });
      ["/cash-and-banks", "/cash-and-banks/opening-balances", "/dashboard"].forEach((p) => revalidatePath(p));
    } else {
      await admin.from("financial_opening_balances").delete().eq("id", id);
    }
    return res;
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}

export async function voidFinancialOpening(id: string, reason: string): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "transactions.void");
    const res = await callPostingRpc("void_financial_opening", { p_id: id, p_user: user.id, p_reason: reason });
    if (res.ok) {
      await writeAuditLog({ userId: user.id, action: "financial_opening.void", resourceType: "financial_opening", resourceId: id, reason });
      ["/cash-and-banks", "/cash-and-banks/opening-balances", "/dashboard"].forEach((p) => revalidatePath(p));
    }
    return res;
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}

/* -------------------------- Overdraft settings -------------------------- */
export async function updateOverdraft(input: {
  paymentAccountId: string; allowNegative: boolean; overdraftLimit: number;
  start?: string | null; end?: string | null;
}): Promise<RpcResult> {
  try {
    const owner = await assertOwner();
    const admin = createAdminClient();
    const { data: before } = await admin.from("payment_accounts").select("company_id, allow_negative, overdraft_limit").eq("id", input.paymentAccountId).maybeSingle();
    if (!before) return { ok: false, error: "Account not found." };
    const { error } = await admin.from("payment_accounts").update({
      allow_negative: input.allowNegative, overdraft_limit: input.overdraftLimit,
      overdraft_start: input.start || null, overdraft_end: input.end || null, updated_by: owner.id,
    }).eq("id", input.paymentAccountId);
    if (error) return { ok: false, error: error.message };
    await writeAuditLog({
      userId: owner.id, companyId: before.company_id, action: "payment_account.overdraft_change",
      resourceType: "payment_account", resourceId: input.paymentAccountId,
      oldValues: { allow_negative: before.allow_negative, overdraft_limit: before.overdraft_limit },
      newValues: { allow_negative: input.allowNegative, overdraft_limit: input.overdraftLimit },
    });
    revalidatePath("/cash-and-banks");
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}
