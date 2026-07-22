import { createHash, randomBytes } from "node:crypto";
import { sql } from "$lib/api/postgres-db";

export type OperatorIdentity = { accountId: string; companyId: number; username: string; displayName: string; role: "admin" | "cajero" };

export function newOperatorToken() {
  return randomBytes(32).toString("hex");
}

export function hashOperatorToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function bearerToken(header: string | null) {
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
}

export async function operatorFromAuthorization(header: string | null): Promise<OperatorIdentity | null> {
  const token = bearerToken(header);
  if (!token) return null;
  const rows = await sql`SELECT a.id AS account_id, a.company_id, a.username, a.display_name, a.role FROM operator_sessions s JOIN operator_accounts a ON a.id = s.account_id WHERE s.token_hash = ${hashOperatorToken(token)} AND s.expires_at > NOW() AND a.active = TRUE`;
  const row = rows[0];
  return row ? { accountId: row.account_id, companyId: row.company_id, username: row.username, displayName: row.display_name, role: row.role } : null;
}
