"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { assertActiveUser, assertPermission, assertOwner } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import { getActiveContext } from "@/lib/context";
import { callPostingRpc, type RpcResult } from "@/lib/rpc";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const fingerprint = (r: { txn_date: string; description: string; reference: string; money_in: number; money_out: number }) =>
  createHash("sha1").update(`${r.txn_date}|${r.description}|${r.reference}|${r.money_in}|${r.money_out}`).digest("hex");

export async function createReconciliation(input: {
  paymentAccountId: string; statementStart: string; statementEnd: string; statementOpening: number; statementClosing: number;
}): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "reconciliation.create");
    const ctx = await getActiveContext();
    const admin = createAdminClient();
    const { data: pa } = await admin.from("payment_accounts").select("company_id").eq("id", input.paymentAccountId).maybeSingle();
    if (!pa || pa.company_id !== ctx.companyId) return { ok: false, error: "Invalid payment account." };
    const { data, error } = await admin.from("bank_reconciliations").insert({
      company_id: ctx.companyId, payment_account_id: input.paymentAccountId, statement_start: input.statementStart,
      statement_end: input.statementEnd, statement_opening: input.statementOpening, statement_closing: input.statementClosing,
      prepared_by: user.id,
    }).select("id").single();
    if (error) return { ok: false, error: error.message };
    await writeAuditLog({ userId: user.id, companyId: ctx.companyId, action: "reconciliation.create", resourceType: "bank_reconciliation", resourceId: data.id });
    revalidatePath("/cash-and-banks/reconciliation");
    return { ok: true, id: data.id };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}

export async function importStatementLines(recId: string, rows: { txn_date: string; description?: string; reference?: string; money_in?: number; money_out?: number }[]): Promise<{ ok: boolean; imported?: number; duplicates?: number; error?: string }> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "reconciliation.import_statement");
    const ctx = await getActiveContext();
    const admin = createAdminClient();
    const { data: rec } = await admin.from("bank_reconciliations").select("company_id, status").eq("id", recId).maybeSingle();
    if (!rec || rec.company_id !== ctx.companyId) return { ok: false, error: "Reconciliation not found." };
    if (rec.status === "finalized") return { ok: false, error: "Reconciliation is finalized." };

    const { data: existing } = await admin.from("bank_statement_lines").select("fingerprint").eq("reconciliation_id", recId);
    const seen = new Set((existing ?? []).map((e) => e.fingerprint));
    let imported = 0, duplicates = 0;
    const toInsert: Record<string, unknown>[] = [];
    for (const raw of rows) {
      if (!raw.txn_date || !/^\d{4}-\d{2}-\d{2}$/.test(raw.txn_date)) continue;
      const moneyIn = round2(Number(raw.money_in || 0)), moneyOut = round2(Number(raw.money_out || 0));
      if (moneyIn < 0 || moneyOut < 0 || (!moneyIn && !moneyOut)) continue;
      const fp = fingerprint({ txn_date: raw.txn_date, description: raw.description ?? "", reference: raw.reference ?? "", money_in: moneyIn, money_out: moneyOut });
      if (seen.has(fp)) { duplicates++; continue; }
      seen.add(fp);
      toInsert.push({ reconciliation_id: recId, txn_date: raw.txn_date, description: raw.description ?? null, reference: raw.reference ?? null, money_in: moneyIn, money_out: moneyOut, fingerprint: fp });
      imported++;
    }
    if (toInsert.length) await admin.from("bank_statement_lines").insert(toInsert);
    if (rec.status === "draft" && imported > 0) await admin.from("bank_reconciliations").update({ status: "in_progress" }).eq("id", recId);
    await writeAuditLog({ userId: user.id, companyId: ctx.companyId, action: "reconciliation.import_statement", resourceType: "bank_reconciliation", resourceId: recId, newValues: { imported, duplicates } });
    revalidatePath(`/cash-and-banks/reconciliation/${recId}`);
    return { ok: true, imported, duplicates };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}

export async function matchStatementLine(recId: string, statementLineId: string, journalLineId: string, amount: number): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "reconciliation.match");
    const ctx = await getActiveContext();
    const admin = createAdminClient();
    const { data: rec } = await admin.from("bank_reconciliations").select("company_id, status").eq("id", recId).maybeSingle();
    if (!rec || rec.company_id !== ctx.companyId) return { ok: false, error: "Reconciliation not found." };
    if (rec.status === "finalized") return { ok: false, error: "Reconciliation is finalized." };
    const { data: line } = await admin.from("bank_statement_lines").select("money_in, money_out, matched_amount").eq("id", statementLineId).maybeSingle();
    if (!line) return { ok: false, error: "Statement line not found." };
    const lineTotal = round2(Number(line.money_in) + Number(line.money_out));
    if (round2(Number(line.matched_amount) + amount) > lineTotal + 0.001) return { ok: false, error: "This would overmatch the statement line." };
    // journal line not already matched
    const { data: dup } = await admin.from("bank_reconciliation_matches").select("id").eq("journal_line_id", journalLineId).maybeSingle();
    if (dup) return { ok: false, error: "That ERP entry is already matched." };
    const { error } = await admin.from("bank_reconciliation_matches").insert({ reconciliation_id: recId, statement_line_id: statementLineId, journal_line_id: journalLineId, amount, created_by: user.id });
    if (error) return { ok: false, error: error.message };
    const newMatched = round2(Number(line.matched_amount) + amount);
    await admin.from("bank_statement_lines").update({ matched_amount: newMatched, status: newMatched >= lineTotal - 0.001 ? "matched" : "partial" }).eq("id", statementLineId);
    await writeAuditLog({ userId: user.id, companyId: ctx.companyId, action: "reconciliation.match", resourceType: "bank_reconciliation", resourceId: recId, newValues: { statementLineId, journalLineId, amount } });
    revalidatePath(`/cash-and-banks/reconciliation/${recId}`);
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}

export async function addReconciliationAdjustment(input: {
  recId: string; statementLineId?: string | null; accountId: string; direction: "in" | "out"; amount: number; description: string; reference?: string;
}): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "reconciliation.match");
    const res = await callPostingRpc("post_bank_adjustment", {
      p_rec: input.recId, p_line: input.statementLineId || null, p_account: input.accountId, p_direction: input.direction,
      p_amount: input.amount, p_description: input.description, p_reference: input.reference || null, p_user: user.id,
    });
    if (res.ok) {
      await writeAuditLog({ userId: user.id, action: "reconciliation.adjustment", resourceType: "bank_reconciliation", resourceId: input.recId, newValues: { account: input.accountId, amount: input.amount, direction: input.direction } });
      ["/cash-and-banks", `/cash-and-banks/reconciliation/${input.recId}`].forEach((p) => revalidatePath(p));
    }
    return res;
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}

export async function finalizeReconciliation(recId: string): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "reconciliation.finalize");
    const ctx = await getActiveContext();
    const admin = createAdminClient();
    const { data: rec } = await admin.from("bank_reconciliations").select("*").eq("id", recId).maybeSingle();
    if (!rec || rec.company_id !== ctx.companyId) return { ok: false, error: "Reconciliation not found." };
    if (rec.status === "finalized") return { ok: false, error: "Already finalized." };
    const { data: lines } = await admin.from("bank_statement_lines").select("money_in, money_out, status").eq("reconciliation_id", recId);
    if (!lines || lines.length === 0) return { ok: false, error: "No statement lines to reconcile." };
    const unresolved = lines.filter((l) => l.status !== "matched" && l.status !== "adjusted").length;
    if (unresolved > 0) return { ok: false, error: `${unresolved} statement line(s) are not yet matched or adjusted.` };
    const stmtNet = round2(lines.reduce((s, l) => s + Number(l.money_in) - Number(l.money_out), 0));
    const declared = round2(Number(rec.statement_closing) - Number(rec.statement_opening));
    if (Math.abs(stmtNet - declared) > 0.05) return { ok: false, error: `Statement lines (${stmtNet}) do not equal closing − opening (${declared}). Difference must be zero.` };
    const { error } = await admin.from("bank_reconciliations").update({ status: "finalized", finalized_by: user.id, finalized_at: new Date().toISOString() }).eq("id", recId);
    if (error) return { ok: false, error: error.message };
    await writeAuditLog({ userId: user.id, companyId: ctx.companyId, action: "reconciliation.finalize", resourceType: "bank_reconciliation", resourceId: recId });
    revalidatePath(`/cash-and-banks/reconciliation/${recId}`);
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}

export async function reopenReconciliation(recId: string, reason: string): Promise<RpcResult> {
  if (!reason?.trim()) return { ok: false, error: "A reason is required." };
  try {
    const owner = await assertOwner();
    const admin = createAdminClient();
    const { data: rec } = await admin.from("bank_reconciliations").select("company_id, status").eq("id", recId).maybeSingle();
    if (!rec) return { ok: false, error: "Not found." };
    const { error } = await admin.from("bank_reconciliations").update({ status: "reopened" }).eq("id", recId);
    if (error) return { ok: false, error: error.message };
    await writeAuditLog({ userId: owner.id, companyId: rec.company_id, action: "reconciliation.reopen", resourceType: "bank_reconciliation", resourceId: recId, reason });
    revalidatePath(`/cash-and-banks/reconciliation/${recId}`);
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Only the Owner can reopen." }; }
}
