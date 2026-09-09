import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const N = (v: unknown) => Number(v ?? 0);

export interface TBRow {
  account_id: string; code: string; name: string; account_type: string; normal_balance: string;
  parent_id: string | null; allow_posting: boolean; cashflow_class: string;
  opening_net: number; period_debit: number; period_credit: number; closing_net: number;
}

export async function trialBalance(companyId: string, start: string, end: string): Promise<TBRow[]> {
  const admin = createAdminClient();
  const { data } = await admin.rpc("report_trial_balance", { p_company: companyId, p_start: start, p_end: end });
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    account_id: r.account_id as string, code: r.code as string, name: r.name as string,
    account_type: r.account_type as string, normal_balance: r.normal_balance as string,
    parent_id: (r.parent_id as string) ?? null, allow_posting: Boolean(r.allow_posting), cashflow_class: r.cashflow_class as string,
    opening_net: N(r.opening_net), period_debit: N(r.period_debit), period_credit: N(r.period_credit), closing_net: N(r.closing_net),
  }));
}

export async function accountBalance(companyId: string, accountId: string, asOf: string): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin.rpc("report_account_balance", { p_company: companyId, p_account: accountId, p_asof: asOf });
  return N(data);
}

/** Account balance resolved by COA code (movement net = debit - credit). */
export async function accountBalanceByCode(companyId: string, code: string, asOf: string): Promise<number> {
  const admin = createAdminClient();
  const { data: acc } = await admin.from("chart_of_accounts").select("id").eq("company_id", companyId).eq("code", code).maybeSingle();
  if (!acc) return 0;
  return accountBalance(companyId, acc.id, asOf);
}

export interface GLLine {
  journal_id: string; entry_date: string; created_at: string; source_type: string;
  source_id: string | null; source_number: string | null; memo: string | null; debit: number; credit: number; running: number;
}
export async function generalLedger(companyId: string, accountId: string, start: string, end: string) {
  const admin = createAdminClient();
  const opening = await accountBalance(companyId, accountId, addDays(start, -1));
  const { data } = await admin.rpc("report_gl_lines", { p_company: companyId, p_account: accountId, p_start: start, p_end: end });
  let running = opening;
  const lines: GLLine[] = ((data ?? []) as Record<string, unknown>[]).map((r) => {
    running = round2(running + N(r.debit) - N(r.credit));
    return {
      journal_id: r.journal_id as string, entry_date: r.entry_date as string, created_at: r.created_at as string,
      source_type: r.source_type as string, source_id: (r.source_id as string) ?? null, source_number: (r.source_number as string) ?? null,
      memo: (r.memo as string) ?? null, debit: N(r.debit), credit: N(r.credit), running,
    };
  });
  const periodDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const periodCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
  return { opening, lines, periodDebit, periodCredit, closing: round2(opening + periodDebit - periodCredit) };
}

/** Profit & Loss for a period, built from account period movements. */
export async function profitAndLoss(companyId: string, start: string, end: string) {
  const tb = await trialBalance(companyId, start, end);
  const byCode = (code: string) => tb.filter((r) => r.code === code);
  // credit-positive amount for revenue-type; debit-positive for expense/cos
  const creditAmt = (rows: TBRow[]) => round2(rows.reduce((s, r) => s + (r.period_credit - r.period_debit), 0));
  const debitAmt = (rows: TBRow[]) => round2(rows.reduce((s, r) => s + (r.period_debit - r.period_credit), 0));

  const salesRevenue = creditAmt(byCode("4100"));
  const salesReturns = debitAmt(byCode("4900")); // contra (debit-normal)
  const netSales = round2(salesRevenue - salesReturns);
  const cogs = debitAmt(tb.filter((r) => r.account_type === "cost_of_sales" && r.allow_posting));
  const grossProfit = round2(netSales - cogs);
  const otherIncome = creditAmt(tb.filter((r) => ["4200", "4300"].includes(r.code)));
  const bankCharges = debitAmt(byCode("6200"));
  const opExpenses = debitAmt(tb.filter((r) => r.account_type === "expense" && r.allow_posting && r.code !== "6200"));
  const operatingProfit = round2(grossProfit + otherIncome - opExpenses);
  const netProfit = round2(operatingProfit - bankCharges);

  const expenseRows = tb.filter((r) => r.account_type === "expense" && r.allow_posting && r.code !== "6200" && (r.period_debit || r.period_credit))
    .map((r) => ({ code: r.code, name: r.name, amount: round2(r.period_debit - r.period_credit) }));

  return { salesRevenue, salesReturns, netSales, cogs, grossProfit, otherIncome, opExpenses, operatingProfit, bankCharges, netProfit, expenseRows };
}

export async function balanceSheet(companyId: string, asOf: string) {
  const tb = await trialBalance(companyId, "1900-01-01", asOf);
  const assetsRows = tb.filter((r) => r.account_type === "asset" && r.allow_posting && r.closing_net !== 0)
    .map((r) => ({ code: r.code, name: r.name, amount: round2(r.closing_net) }));
  const liabRows = tb.filter((r) => r.account_type === "liability" && r.allow_posting && r.closing_net !== 0)
    .map((r) => ({ code: r.code, name: r.name, amount: round2(-r.closing_net) }));
  const equityRows = tb.filter((r) => r.account_type === "equity" && r.allow_posting && r.closing_net !== 0)
    .map((r) => ({ code: r.code, name: r.name, amount: round2(-r.closing_net) }));
  const assets = round2(assetsRows.reduce((s, r) => s + r.amount, 0));
  const liabilities = round2(liabRows.reduce((s, r) => s + r.amount, 0));
  const equityPosted = round2(equityRows.reduce((s, r) => s + r.amount, 0));
  // current earnings = credit-positive net of all P&L accounts up to asOf
  const currentEarnings = round2(tb.filter((r) => ["revenue", "cost_of_sales", "expense"].includes(r.account_type))
    .reduce((s, r) => s + (-r.closing_net), 0));
  const equity = round2(equityPosted + currentEarnings);
  return {
    assetsRows, liabRows, equityRows, assets, liabilities, equityPosted, currentEarnings, equity,
    balanced: Math.abs(assets - (liabilities + equity)) < 0.005,
    difference: round2(assets - (liabilities + equity)),
  };
}

export async function cashFlow(companyId: string, start: string, end: string) {
  const admin = createAdminClient();
  const { data } = await admin.rpc("report_cash_flow", { p_company: companyId, p_start: start, p_end: end });
  const rows = (data ?? []) as { source_type: string; opening: number; movement: number }[];
  const opening = round2(rows.reduce((s, r) => s + N(r.opening), 0));
  const EXCLUDED = new Set(["financial_opening_line", "financial_opening_line_void"]);
  const UNCLASSIFIED = new Set(["manual_journal", "manual_journal_void", "accounting_opening", "accounting_opening_void", "bank_adjustment", "bank_adjustment_void"]);
  let operating = 0, investing = 0, financing = 0, excluded = 0, unclassified = 0;
  for (const r of rows) {
    const m = N(r.movement);
    if (EXCLUDED.has(r.source_type)) excluded = round2(excluded + m);
    else if (UNCLASSIFIED.has(r.source_type)) unclassified = round2(unclassified + m);
    else operating = round2(operating + m); // sales/purchases/expenses/receipts/transfers(fee)
  }
  const net = round2(operating + investing + financing + excluded + unclassified);
  return { opening, operating, investing, financing, excluded, unclassified, net, closing: round2(opening + net) };
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
