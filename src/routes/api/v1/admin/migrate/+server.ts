import { json, type RequestHandler } from "@sveltejs/kit";
import { hasMigrationAccess } from "$lib/api/admin-auth";
import { initDb } from "$lib/api/postgres-db";

// This endpoint is exclusively for the owner-backed deployment job. Do not
// expose its token to tenant services or switch it to the restricted API role.
export const POST: RequestHandler = async ({ request }) => {
  if (!hasMigrationAccess(request.headers.get("authorization"), process.env.HEXA_MIGRATION_TOKEN)) {
    return json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    await initDb();
    return json({ status: "migrated" });
  } catch (cause) {
    console.error("Central migration failed", cause);
    return json({ error: "No se pudo migrar la base de datos" }, { status: 500 });
  }
};
