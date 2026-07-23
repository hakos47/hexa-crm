import { createHash, randomBytes } from "node:crypto";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
const tenantCode = process.env.HEXA_TENANT_CODE;
const username = process.env.HEXA_OPERATOR_USERNAME;
const displayName = process.env.HEXA_OPERATOR_DISPLAY_NAME;
const password = process.env.HEXA_OPERATOR_PASSWORD;
const role = process.env.HEXA_OPERATOR_ROLE ?? "admin";
if (!url || !tenantCode || !username || !displayName || !password || !["admin", "cajero"].includes(role)) {
  console.error("Required: DATABASE_URL, HEXA_TENANT_CODE, HEXA_OPERATOR_USERNAME, HEXA_OPERATOR_DISPLAY_NAME, HEXA_OPERATOR_PASSWORD; optional HEXA_OPERATOR_ROLE=admin|cajero");
  process.exit(2);
}
const salt = randomBytes(16).toString("hex");
const credentialHash = `v1$${salt}$${createHash("sha256").update(`${salt}:${password.trim()}`).digest("hex")}`;
const sql = postgres(url, { max: 1 });
try {
  const company = await sql`SELECT id FROM companies WHERE code = ${tenantCode} AND active = TRUE`;
  if (!company[0]) throw new Error("Tenant not found or inactive");
  const existing = await sql`SELECT id FROM operator_accounts WHERE company_id = ${company[0].id} AND username = ${username.trim().toLowerCase()}`;
  const id = existing[0]?.id ?? crypto.randomUUID();
  await sql`INSERT INTO operator_accounts (id, company_id, username, display_name, role, credential_hash) VALUES (${id}, ${company[0].id}, ${username.trim().toLowerCase()}, ${displayName}, ${role}, ${credentialHash}) ON CONFLICT (company_id, username) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role, credential_hash = EXCLUDED.credential_hash, active = TRUE`;
  console.log(JSON.stringify({ tenant: tenantCode, operator: username.trim().toLowerCase(), role }));
} finally { await sql.end({ timeout: 5 }); }
