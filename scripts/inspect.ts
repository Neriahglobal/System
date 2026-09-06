import { createDbClient } from "./db";

async function main() {
  const db = createDbClient();
  await db.connect();
  try {
    const mig = await db.query("select name from schema_migrations order by name");
    console.log("migrations:", mig.rows.map((r) => r.name).join(", "));

    const co = await db.query("select id, code, name from companies");
    console.log("companies:", co.rows);

    const coa = await db.query(
      "select code, name, account_type, normal_balance from chart_of_accounts order by code",
    );
    console.log("COA codes:", coa.rows.map((r) => `${r.code}:${r.name}`).join(" | "));

    const pa = await db.query(
      "select code, name, account_type, ledger_account_id from payment_accounts order by code",
    );
    console.log("payment_accounts:", pa.rows);

    const ds = await db.query(
      "select document_type, prefix, current_number, number_length from document_sequences order by document_type",
    );
    console.log("doc sequences:", ds.rows.map((r) => `${r.document_type}(${r.prefix})`).join(", "));

    const perms = await db.query("select count(*)::int as n from permissions");
    console.log("permissions count:", perms.rows[0].n);
  } finally {
    await db.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
