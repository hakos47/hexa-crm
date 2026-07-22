import { json, type RequestHandler } from "@sveltejs/kit";
import { newOperatorToken, hashOperatorToken } from "$lib/api/operator-auth";
import { sql } from "$lib/api/postgres-db";
import { setTenantRls } from "$lib/api/tenant-rls";
import { verifyCredential } from "$lib/auth/pin";

export const POST: RequestHandler = async ({ request }) => {
  const requestId = crypto.randomUUID();
  let input: { tenant_code?: string; username?: string; password?: string };
  try { input = await request.json(); } catch { return json({ error: "Solicitud inválida", code: "invalid_json", request_id: requestId }, { status: 400 }); }
  if (!input.tenant_code || !input.username || !input.password) return json({ error: "Faltan credenciales", code: "invalid_credentials", request_id: requestId }, { status: 400 });
  const accounts = await sql`SELECT a.id, a.company_id, a.username, a.display_name, a.role, a.credential_hash FROM operator_accounts a JOIN companies c ON c.id = a.company_id WHERE c.code = ${input.tenant_code} AND c.active = TRUE AND a.username = ${input.username.trim().toLowerCase()} AND a.active = TRUE`;
  if (!accounts[0] || !await verifyCredential(input.password, accounts[0].credential_hash)) return json({ error: "Usuario o contraseña incorrectos", code: "invalid_credentials", request_id: requestId }, { status: 401 });
  const account = accounts[0];
  const token = newOperatorToken();
  const expiresAt = new Date(Date.now() + 8 * 60 * 60_000);
  await sql.begin(async (tx) => {
    await setTenantRls(tx, account.company_id);
    await tx`DELETE FROM operator_sessions WHERE expires_at <= NOW()`;
    await tx`INSERT INTO operator_sessions (token_hash, account_id, company_id, expires_at) VALUES (${hashOperatorToken(token)}, ${account.id}, ${account.company_id}, ${expiresAt})`;
    await tx`INSERT INTO service_audit_log (company_id, key_id, action, request_id) VALUES (${account.company_id}, ${`operator:${account.username}`}, 'operator.login', ${requestId})`;
  });
  return json({ token, expires_at: expiresAt.toISOString(), operator: { username: account.username, display_name: account.display_name, role: account.role }, tenant_code: input.tenant_code, request_id: requestId });
};
