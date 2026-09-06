"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { assertActiveUser, assertPermission, assertBranchAccess } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import { getActiveContext } from "@/lib/context";
import { callPostingRpc, type RpcResult } from "@/lib/rpc";
import { round2 } from "@/lib/sales/calc";

export async function createAndPostReceipt(input: {
  branchId: string;
  customerId: string;
  documentDate: string;
  paymentAccountId: string;
  amount: number;
  reference?: string;
  notes?: string;
  allocations: { sale_id: string; amount: number }[];
}): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "sales.receive_payment");
    const ctx = await getActiveContext();
    assertBranchAccess(user, input.branchId);

    if (!(input.amount > 0)) return { ok: false, error: "Amount must be greater than zero." };
    const allocTotal = round2(input.allocations.reduce((s, a) => s + (a.amount || 0), 0));
    if (allocTotal !== round2(input.amount)) {
      return { ok: false, error: "Allocations must equal the payment amount (no overpayment)." };
    }

    const admin = createAdminClient();
    const { data: rec, error } = await admin.from("customer_receipts").insert({
      company_id: ctx.companyId, branch_id: input.branchId, customer_id: input.customerId,
      document_date: input.documentDate, payment_account_id: input.paymentAccountId,
      amount: input.amount, reference: input.reference || null, notes: input.notes || null,
      created_by: user.id,
    }).select("id").single();
    if (error) return { ok: false, error: error.message };
    const receiptId = rec.id;
    await admin.from("customer_receipt_allocations").insert(
      input.allocations.filter((a) => a.amount > 0).map((a) => ({
        receipt_id: receiptId, sale_id: a.sale_id, amount: a.amount,
      })),
    );

    const res = await callPostingRpc("post_customer_receipt", { p_id: receiptId, p_user: user.id, p_idem: randomUUID() });
    if (res.ok) {
      await writeAuditLog({ userId: user.id, companyId: ctx.companyId, branchId: input.branchId, action: "customer_receipt.post", resourceType: "customer_receipt", resourceId: receiptId });
      revalidatePath("/sales/customer-payments"); revalidatePath("/sales/history"); revalidatePath("/dashboard");
    } else {
      await admin.from("customer_receipts").delete().eq("id", receiptId);
    }
    return res;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed." };
  }
}

export async function voidReceipt(receiptId: string, reason: string): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "transactions.void");
    const res = await callPostingRpc("void_customer_receipt", { p_id: receiptId, p_user: user.id, p_reason: reason });
    if (res.ok) {
      await writeAuditLog({ userId: user.id, action: "customer_receipt.void", resourceType: "customer_receipt", resourceId: receiptId, reason });
      revalidatePath("/sales/customer-payments"); revalidatePath("/sales/history"); revalidatePath("/dashboard");
    }
    return res;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed." };
  }
}
