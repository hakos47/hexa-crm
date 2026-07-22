import postgres from "postgres";

const url = process.env.DATABASE_URL;
const user = process.env.HEXA_API_DB_USER;
const password = process.env.HEXA_API_DB_PASSWORD;
if (!url || !user || !password || !/^[a-z_][a-z0-9_]{1,62}$/.test(user)) {
  console.error("Required: DATABASE_URL, HEXA_API_DB_USER (safe SQL identifier), HEXA_API_DB_PASSWORD");
  process.exit(2);
}
const sql = postgres(url, { max: 1 });
try {
  const roleSql = await sql`SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT', ${user}::text, ${password}::text) AS statement`;
  try { await sql.unsafe(roleSql[0].statement); } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("already exists")) throw error;
    const alterSql = await sql`SELECT format('ALTER ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT', ${user}::text, ${password}::text) AS statement`;
    await sql.unsafe(alterSql[0].statement);
  }
  await sql.unsafe(`GRANT USAGE ON SCHEMA public TO ${user}`);
  await sql.unsafe(`GRANT SELECT, INSERT, DELETE ON operator_sessions TO ${user}`);
  await sql.unsafe(`GRANT SELECT ON companies, schema_migrations, pg_extension, operator_accounts TO ${user}`);
  await sql.unsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON products, customers, sales, sale_lines, cash_movements, reservations, reservation_lines, orders, order_lines, external_customer_identities, semantic_documents, semantic_metrics, idempotency_keys, service_request_replays, service_audit_log TO ${user}`);
  await sql.unsafe(`GRANT INSERT ON stock_movements TO ${user}`);
  await sql.unsafe(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${user}`);
  console.log(JSON.stringify({ api_db_user: user, rls: "enforced for non-owner role" }));
} finally { await sql.end({ timeout: 5 }); }
