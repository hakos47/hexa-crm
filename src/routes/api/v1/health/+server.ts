import { json, type RequestHandler } from "@sveltejs/kit";
import { sql } from "$lib/api/postgres-db";
import { centralHealthStatus } from "$lib/api/central-health";

/** Readiness check: never runs migrations or seeds data. */
export const GET: RequestHandler = async () => {
  try {
    await sql`SELECT 1`;
    const migrations = await sql`
      SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_migrations') AS table_exists
    `;
    const applied = migrations[0]?.table_exists
      ? await sql`SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '0003_reservations') AS ready`
      : [{ ready: false }];
    const vector = await sql`SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS ready`;
    const result = centralHealthStatus({
      databaseReachable: true,
      migrationsReady: !!applied[0]?.ready,
      pgvectorReady: !!vector[0]?.ready,
    });
    return json(result.body, { status: result.status });
  } catch {
    const result = centralHealthStatus({ databaseReachable: false, migrationsReady: false, pgvectorReady: null });
    return json(result.body, { status: result.status });
  }
};
