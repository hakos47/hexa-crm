import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
const code = process.env.HEXA_TENANT_CODE;
const legalName = process.env.HEXA_TENANT_LEGAL_NAME;
const tradeName = process.env.HEXA_TENANT_TRADE_NAME;

if (!databaseUrl || !code || !legalName || !tradeName) {
  console.error("Required: DATABASE_URL, HEXA_TENANT_CODE, HEXA_TENANT_LEGAL_NAME, HEXA_TENANT_TRADE_NAME");
  process.exit(2);
}
if (!/^[A-Z0-9_-]{2,32}$/.test(code)) {
  console.error("HEXA_TENANT_CODE must be uppercase alphanumeric, _ or -");
  process.exit(2);
}

const sql = postgres(databaseUrl, { max: 1 });
try {
  const rows = await sql`
    INSERT INTO companies (code, legal_name, trade_name, nif, kind, active)
    VALUES (${code}, ${legalName}, ${tradeName}, ${process.env.HEXA_TENANT_NIF ?? ""}, 'retail_secondhand', TRUE)
    ON CONFLICT (code) DO UPDATE SET legal_name = EXCLUDED.legal_name, trade_name = EXCLUDED.trade_name, active = TRUE
    RETURNING id, code, trade_name
  `;
  console.log(JSON.stringify({ tenant: rows[0] }));
} finally {
  await sql.end({ timeout: 5 });
}
