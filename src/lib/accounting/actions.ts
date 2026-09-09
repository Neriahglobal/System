"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { assertActiveUser, assertPermission, assertOwner } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import { getActiveContext, can } from "@/lib/context";
import { callPostingRpc, type RpcResult } from "@/lib/rpc";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface JournalLineInput { account_id: string; branch_id?: string | null; customer_id?: string | null; supplier_id?: string | null; debit: number; credit: number; description?: string }
export interface ManualJournalInput {
  journalId?: string; branchId?: string | null; journalDate: string; reference?: string; description?: string; notes?: string; lines: JournalLineInput[];
}

export async function saveManualJournalDraft(input: ManualJournalInput): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "accounting.create_manual_journal");
    const ctx = await getActiveContext();
    const lines = input.lines.filter((l) => l.account_id && (Number(l.debit) > 0 || Number(l.credit) > 0));
    if (lines.length < 2) return { ok: false, error: "A journal needs at least two lines." };
    for (const l of lines) {
      if (Number(l.debit) > 0 && Number(l.credit) > 0) return { ok: false, error: "A line cannot have both debit and credit." };
    }
    const td = round2(lines.reduce((s, l) => s + Number(l.debit || 0), 0));
    const tc = round2(lines.reduce((s, l) => s + Number(l.credit || 0), 0));
    if (td !== tc) return { ok: false, error: `Journal is not balanced (debit ${td} vs credit ${tc}).` };

    const admin = createAdminClient();
    const header = {
      company_id: ctx.companyId, branch_id: input.branchId || null, journal_date: input.journalDate,
      reference: input.reference || null, description: input.description || null, notes: input.notes || null,
      total_debit: td, total_credit: tc, updated_by: user.id,
    };
    let id = input.journalId ?? null;
    if (id) {
      const { data: ex } = await admin.from("manual_journal_drafts").select("document_status, company_id").eq("id", id).maybeSingle();
      if (!ex || ex.company_id !== ctx.companyId) return { ok: false, error: "Journal not found." };
      if (ex.document_status !== "draft") return { ok: false, error: "Only drafts can be edited." };
      const { error } = await admin.from("manual_journal_drafts").update(header).eq("id", id);
      if (error) return { ok: false, error: error.message };
      await admin.from("manual_journal_draft_lines").delete().eq("draft_id", id);
    } else {
      const { data, error } = await admin.from("manual_journal_drafts").insert({ ...header, created_by: user.id }).select("id").single();
      if (error) return { ok: false, error: error.message };
      id = data.id;
    }
    await admin.from("manual_journal_draft_lines").insert(lines.map((l, i) => ({
      draft_id: id, account_id: l.account_id, branch_id: l.branch_id || null, customer_id: l.customer_id || null,
      supplier_id: l.supplier_id || null, debit: Number(l.debit || 0), credit: Number(l.credit || 0), description: l.description || null, line_no: i + 1,
    })));
    await writeAuditLog({ userId: user.id, companyId: ctx.companyId, action: input.journalId ? "manual_journal.draft_edit" : "manual_journal.draft_create", resourceType: "manual_journal", resourceId: id! });
    revalidatePath("/accounting/journals");
    return { ok: true, id: id! };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}

export async function postManualJournal(id: string): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "accounting.post_manual_journal");
    const ctx = await getActiveContext();
    const admin = createAdminClient();
    const { data: draft } = await admin.from("manual_journal_drafts").select("company_id").eq("id", id).maybeSingle();
    if (!draft || draft.company_id !== ctx.companyId) return { ok: false, error: "Journal not found." };
    // Does any line hit a control account?
    const { data: lines } = await admin.from("manual_journal_draft_lines").select("account:chart_of_accounts(is_control, code)").eq("draft_id", id);
    const hitsControl = (lines ?? []).some((l) => (l.account as unknown as { is_control: boolean } | null)?.is_control);
    const allowControl = can(user, "accounting.post_control_account_adjustment");
    if (hitsControl && !allowControl) return { ok: false, error: "This journal posts to a control account. Only the Owner may post a control-account adjustment." };
    const res = await callPostingRpc("post_manual_journal", { p_id: id, p_user: user.id, p_idem: randomUUID(), p_allow_control: allowControl });
    if (res.ok) {
      await writeAuditLog({ userId: user.id, companyId: ctx.companyId, action: hitsControl ? "manual_journal.control_adjustment" : "manual_journal.post", resourceType: "manual_journal", resourceId: id });
      ["/accounting/journals", `/accounting/journals/${id}`, "/accounting/general-ledger", "/reports", "/dashboard"].forEach((p) => revalidatePath(p));
    }
    return res;
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}

export async function deleteManualJournalDraft(id: string, reason: string): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "transactions.delete_draft");
    const admin = createAdminClient();
    const { data } = await admin.from("manual_journal_drafts").select("document_status").eq("id", id).maybeSingle();
    if (!data || data.document_status !== "draft") return { ok: false, error: "Only drafts can be deleted." };
    const { error } = await admin.from("manual_journal_drafts").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    await writeAuditLog({ userId: user.id, action: "manual_journal.draft_delete", resourceType: "manual_journal", resourceId: id, reason });
    revalidatePath("/accounting/journals");
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}

export async function voidManualJournal(id: string, reason: string): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "transactions.void");
    const res = await callPostingRpc("void_manual_journal", { p_id: id, p_user: user.id, p_reason: reason });
    if (res.ok) {
      await writeAuditLog({ userId: user.id, action: "manual_journal.void", resourceType: "manual_journal", resourceId: id, reason });
      ["/accounting/journals", `/accounting/journals/${id}`, "/accounting/general-ledger", "/reports", "/dashboard"].forEach((p) => revalidatePath(p));
    }
    return res;
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}

/* ------------------------- Opening balances ----------------------------- */
export async function createAndPostGeneralOpening(input: {
  openingDate: string; reference?: string; description?: string;
  lines: { account_id: string; debit: number; credit: number; description?: string }[];
}): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "accounting.manage_opening_balances");
    const ctx = await getActiveContext();
    const lines = input.lines.filter((l) => l.account_id && (Number(l.debit) > 0 || Number(l.credit) > 0));
    if (lines.length < 2) return { ok: false, error: "Add at least two lines." };
    const admin = createAdminClient();
    const { data: head, error } = await admin.from("accounting_opening_balances").insert({
      company_id: ctx.companyId, opening_date: input.openingDate, reference: input.reference || null, description: input.description || null, created_by: user.id,
    }).select("id").single();
    if (error) return { ok: false, error: error.message };
    await admin.from("accounting_opening_balance_lines").insert(lines.map((l, i) => ({
      opening_id: head.id, account_id: l.account_id, debit: Number(l.debit || 0), credit: Number(l.credit || 0), description: l.description || null, line_no: i + 1,
    })));
    const res = await callPostingRpc("post_accounting_opening", { p_id: head.id, p_user: user.id, p_idem: randomUUID() });
    if (res.ok) await writeAuditLog({ userId: user.id, companyId: ctx.companyId, action: "accounting_opening.post", resourceType: "accounting_opening", resourceId: head.id });
    else await admin.from("accounting_opening_balances").delete().eq("id", head.id);
    revalidatePath("/accounting/opening-balances");
    return res;
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}

export async function createAndPostCustomerOpening(input: { branchId: string; customerId: string; reference?: string; invoiceDate: string; dueDate?: string | null; amount: number }): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "accounting.manage_opening_balances");
    const ctx = await getActiveContext();
    if (!(input.amount > 0)) return { ok: false, error: "Amount must be greater than zero." };
    const admin = createAdminClient();
    const { data: head, error } = await admin.from("customer_opening_balances").insert({
      company_id: ctx.companyId, branch_id: input.branchId, customer_id: input.customerId, reference: input.reference || null,
      invoice_date: input.invoiceDate, due_date: input.dueDate || null, amount: input.amount, created_by: user.id,
    }).select("id").single();
    if (error) return { ok: false, error: error.message };
    const res = await callPostingRpc("post_customer_opening", { p_id: head.id, p_user: user.id, p_idem: randomUUID() });
    if (res.ok) await writeAuditLog({ userId: user.id, companyId: ctx.companyId, action: "customer_opening.post", resourceType: "customer_opening", resourceId: head.id });
    else await admin.from("customer_opening_balances").delete().eq("id", head.id);
    revalidatePath("/accounting/opening-balances");
    return res;
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}

export async function createAndPostSupplierOpening(input: { branchId: string; supplierId: string; reference?: string; documentDate: string; dueDate?: string | null; amount: number }): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "accounting.manage_opening_balances");
    const ctx = await getActiveContext();
    if (!(input.amount > 0)) return { ok: false, error: "Amount must be greater than zero." };
    const admin = createAdminClient();
    const { data: head, error } = await admin.from("supplier_opening_balances").insert({
      company_id: ctx.companyId, branch_id: input.branchId, supplier_id: input.supplierId, reference: input.reference || null,
      document_date: input.documentDate, due_date: input.dueDate || null, amount: input.amount, created_by: user.id,
    }).select("id").single();
    if (error) return { ok: false, error: error.message };
    const res = await callPostingRpc("post_supplier_opening", { p_id: head.id, p_user: user.id, p_idem: randomUUID() });
    if (res.ok) await writeAuditLog({ userId: user.id, companyId: ctx.companyId, action: "supplier_opening.post", resourceType: "supplier_opening", resourceId: head.id });
    else await admin.from("supplier_opening_balances").delete().eq("id", head.id);
    revalidatePath("/accounting/opening-balances");
    return res;
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}

/* --------------------------- Period control ----------------------------- */
export interface CloseCheck { key: string; label: string; severity: "blocking" | "warning" | "passed"; count: number; detail: string }

export async function runPeriodChecks(periodId: string): Promise<{ ok: boolean; checks?: CloseCheck[]; error?: string }> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "periods.view");
    const ctx = await getActiveContext();
    const admin = createAdminClient();
    const { data: period } = await admin.from("accounting_periods").select("*").eq("id", periodId).maybeSingle();
    if (!period || period.company_id !== ctx.companyId) return { ok: false, error: "Period not found." };
    const start = period.start_date as string, end = period.end_date as string;

    const draftCount = async (table: string, dateCol: string) => {
      const { count } = await admin.from(table).select("id", { count: "exact", head: true })
        .eq("company_id", ctx.companyId).eq("document_status", "draft").gte(dateCol, start).lte(dateCol, end);
      return count ?? 0;
    };
    const checks: CloseCheck[] = [];
    const blk = (key: string, label: string, count: number) => checks.push({ key, label, severity: count > 0 ? "blocking" : "passed", count, detail: count > 0 ? `${count} item(s)` : "None" });
    const warn = (key: string, label: string, count: number) => checks.push({ key, label, severity: count > 0 ? "warning" : "passed", count, detail: count > 0 ? `${count} item(s)` : "None" });

    blk("sales_drafts", "Unposted sales drafts", await draftCount("sales", "document_date"));
    blk("purchase_drafts", "Unposted purchase drafts", await draftCount("purchases", "document_date"));
    blk("expense_drafts", "Unposted expense drafts", await draftCount("expenses", "document_date"));
    blk("income_drafts", "Unposted other-income drafts", await draftCount("other_income_transactions", "document_date"));
    blk("transfer_drafts", "Unposted cash-transfer drafts", await draftCount("cash_transfers", "transfer_date"));
    blk("manual_drafts", "Unposted manual journals", await draftCount("manual_journal_drafts", "journal_date"));

    const { count: negStock } = await admin.from("stock_balances").select("id", { count: "exact", head: true }).eq("company_id", ctx.companyId).lt("quantity", 0);
    blk("negative_stock", "Negative inventory", negStock ?? 0);

    const { data: unresolved } = await admin.from("stock_transfers").select("id", { count: "exact", head: true }).eq("company_id", ctx.companyId).in("status", ["dispatched", "partially_received"]);
    void unresolved;
    const { count: openTransfers } = await admin.from("stock_transfers").select("id", { count: "exact", head: true }).eq("company_id", ctx.companyId).in("status", ["dispatched", "partially_received"]);
    warn("open_transfers", "Unresolved stock transfers", openTransfers ?? 0);

    const { count: openRecs } = await admin.from("bank_reconciliations").select("id", { count: "exact", head: true }).eq("company_id", ctx.companyId).in("status", ["draft", "in_progress", "reopened"]);
    warn("open_recs", "Incomplete bank reconciliations", openRecs ?? 0);

    // Reconciliation differences (blocking)
    const { reconciliationControls } = await import("@/lib/reports/subledger");
    const controls = await reconciliationControls(ctx.companyId, end);
    for (const c of controls) {
      if (c.status !== "Reconciled") checks.push({ key: `control_${c.key}`, label: c.label, severity: "blocking", count: 1, detail: `Difference ${c.difference}` });
      else checks.push({ key: `control_${c.key}`, label: c.label, severity: "passed", count: 0, detail: "Reconciled" });
    }

    // persist
    await admin.from("accounting_period_close_checks").delete().eq("period_id", periodId);
    await admin.from("accounting_period_close_checks").insert(checks.map((c) => ({ period_id: periodId, check_key: c.key, severity: c.severity, detail: c.detail, item_count: c.count })));
    return { ok: true, checks };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}

async function periodTransition(periodId: string, to: "closed" | "open" | "locked", perm: string, event: string, reason?: string, ack?: unknown): Promise<RpcResult> {
  const user = await assertActiveUser();
  assertPermission(user, perm);
  const ctx = await getActiveContext();
  const admin = createAdminClient();
  const { data: period } = await admin.from("accounting_periods").select("company_id, status").eq("id", periodId).maybeSingle();
  if (!period || period.company_id !== ctx.companyId) return { ok: false, error: "Period not found." };
  const from = period.status as string;
  const patch: Record<string, unknown> = { status: to, updated_by: user.id };
  if (to === "closed") { patch.closed_by = user.id; patch.closed_at = new Date().toISOString(); }
  if (to === "open") { patch.closed_by = null; patch.closed_at = null; }
  const { error } = await admin.from("accounting_periods").update(patch).eq("id", periodId);
  if (error) return { ok: false, error: error.message };
  await admin.from("accounting_period_events").insert({ period_id: periodId, company_id: ctx.companyId, event, from_status: from, to_status: to, reason: reason || null, acknowledgements: ack ?? null, created_by: user.id });
  await writeAuditLog({ userId: user.id, companyId: ctx.companyId, action: `period.${event}`, resourceType: "accounting_period", resourceId: periodId, oldValues: { status: from }, newValues: { status: to }, reason: reason || null });
  revalidatePath("/accounting/period-close");
  return { ok: true, id: periodId };
}

export async function closePeriod(periodId: string, acknowledgeWarnings: boolean, note?: string): Promise<RpcResult> {
  try {
    const user = await assertActiveUser();
    assertPermission(user, "periods.close");
    const checks = await runPeriodChecks(periodId);
    if (!checks.ok || !checks.checks) return { ok: false, error: checks.error ?? "Could not run checks." };
    const blocking = checks.checks.filter((c) => c.severity === "blocking");
    if (blocking.length > 0) return { ok: false, error: `Cannot close: ${blocking.length} blocking issue(s). Resolve them first.` };
    const warnings = checks.checks.filter((c) => c.severity === "warning");
    if (warnings.length > 0 && !acknowledgeWarnings) return { ok: false, error: `There are ${warnings.length} warning(s). Provide an explanation to proceed.` };
    void user;
    return periodTransition(periodId, "closed", "periods.close", "close", note, { warnings: warnings.map((w) => w.key), note });
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Failed." }; }
}
export async function reopenPeriod(periodId: string, reason: string): Promise<RpcResult> {
  if (!reason?.trim()) return { ok: false, error: "A reason is required." };
  try { await assertOwner(); } catch { return { ok: false, error: "Only the Owner can reopen a period." }; }
  return periodTransition(periodId, "open", "periods.reopen", "reopen", reason);
}
export async function lockPeriod(periodId: string, reason: string): Promise<RpcResult> {
  return periodTransition(periodId, "locked", "periods.lock", "lock", reason);
}
export async function unlockPeriod(periodId: string, reason: string): Promise<RpcResult> {
  if (!reason?.trim()) return { ok: false, error: "A reason is required." };
  try { await assertOwner(); } catch { return { ok: false, error: "Only the Owner can unlock a period." }; }
  return periodTransition(periodId, "open", "periods.unlock", "unlock", reason);
}
