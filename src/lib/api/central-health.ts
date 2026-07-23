export type CentralHealth = {
  api: "ok";
  database: "ok" | "unavailable";
  migrations: "ready" | "pending";
  pgvector: "ready" | "missing" | "unknown";
};

export function centralHealthStatus(input: {
  databaseReachable: boolean;
  migrationsReady: boolean;
  pgvectorReady: boolean | null;
}): { body: CentralHealth; status: number } {
  if (!input.databaseReachable) {
    return { body: { api: "ok", database: "unavailable", migrations: "pending", pgvector: "unknown" }, status: 503 };
  }
  const body: CentralHealth = {
    api: "ok",
    database: "ok",
    migrations: input.migrationsReady ? "ready" : "pending",
    pgvector: input.pgvectorReady ? "ready" : "missing",
  };
  return { body, status: input.migrationsReady && input.pgvectorReady ? 200 : 503 };
}
