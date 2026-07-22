import type postgres from "postgres";

/** Sets the PostgreSQL tenant context for the current transaction only. */
export async function setTenantRls(tx: postgres.TransactionSql, companyId: number): Promise<void> {
  await tx`SELECT set_config('app.company_id', ${String(companyId)}, TRUE)`;
}
