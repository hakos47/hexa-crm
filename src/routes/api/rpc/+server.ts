import { json, type RequestHandler } from "@sveltejs/kit";
import { postgresApi, initDb } from "$lib/api/postgres-db";

// Inicialización de la base de datos (se ejecuta de fondo al arrancar)
let dbInitialized = false;
const dbInitPromise = initDb()
  .then(() => {
    dbInitialized = true;
    console.log("[PostgreSQL] Base de datos inicializada y migrada.");
  })
  .catch((err) => {
    console.error("[PostgreSQL] Error al inicializar base de datos:", err);
  });

export const POST: RequestHandler = async ({ request }) => {
  // Asegurar que la DB esté lista
  if (!dbInitialized) {
    await dbInitPromise;
  }

  try {
    const { cmd, args } = await request.json();
    const authHeader = request.headers.get("Authorization");
    let token: string | null = null;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    } else if (args && typeof args === "object" && "token" in args) {
      token = args.token as string | null;
    }

    if (!cmd) {
      return json({ error: "Comando ausente" }, { status: 400 });
    }

    let result: any;

    switch (cmd) {
      case "public_meta":
        result = await postgresApi.public_meta();
        break;
      case "login":
        result = await postgresApi.login(args?.username as string, (args?.password as string) || (args?.pin as string));
        break;
      case "logout":
        result = await postgresApi.logout(token);
        break;
      case "session_me":
        result = await postgresApi.session_me(token);
        break;
      case "list_users":
        result = await postgresApi.list_users(token);
        break;
      case "upsert_user":
        result = await postgresApi.upsert_user(args?.input, token);
        break;
      case "change_own_pin":
        result = await postgresApi.change_own_pin(args?.current_pin as string, args?.new_pin as string, token);
        break;
      case "complete_forced_password_change":
        result = await postgresApi.complete_forced_password_change(args?.current_password as string, args?.new_password as string, token);
        break;
      case "list_products":
        result = await postgresApi.list_products(!!args?.active_only, token);
        break;
      case "upsert_product":
        result = await postgresApi.upsert_product(args?.input, token);
        break;
      case "adjust_stock":
        result = await postgresApi.adjust_stock(args?.product_id as number, args?.delta as number, args?.reason as string, token);
        break;
      case "list_customers":
        result = await postgresApi.list_customers(token);
        break;
      case "upsert_customer":
        result = await postgresApi.upsert_customer(args?.input, token);
        break;
      case "create_sale":
        result = await postgresApi.create_sale(args?.lines, args?.customer_id, args?.notes, token);
        break;
      case "list_sales":
        result = await postgresApi.list_sales(token);
        break;
      case "get_sale":
        result = await postgresApi.get_sale(args?.id as number, token);
        break;
      case "cancel_sale":
        result = await postgresApi.cancel_sale(args?.id as number, token);
        break;
      case "list_cash_movements":
        result = await postgresApi.list_cash_movements(token);
        break;
      case "create_cash_movement":
        result = await postgresApi.create_cash_movement(args?.input, token);
        break;
      case "get_cash_balance":
        result = await postgresApi.get_cash_balance(token);
        break;
      case "vat_summary":
        result = await postgresApi.vat_summary(args?.from as string, args?.to as string, token);
        break;
      case "dashboard_stats":
        result = await postgresApi.dashboard_stats(token);
        break;
      case "get_settings":
        result = await postgresApi.get_settings(token);
        break;
      case "update_settings":
        result = await postgresApi.update_settings(args?.partial, token);
        break;
      case "ai_chat":
        result = await postgresApi.ai_chat(args?.messages, token);
        break;
      case "ollama_health":
        result = await postgresApi.ollama_health(token);
        break;
      case "reset_demo":
        result = await postgresApi.reset_demo(token);
        break;
      case "export_backup":
        result = await postgresApi.export_backup(token);
        break;
      case "pre_migration_backup":
        result = await postgresApi.pre_migration_backup(String(args?.reason ?? "manual"), token);
        break;
      case "restore_backup":
        result = await postgresApi.restore_backup(args?.raw, token);
        break;
      default:
        return json({ error: `Comando no soportado: ${cmd}` }, { status: 400 });
    }

    return json(result);
  } catch (error: any) {
    console.error(`Error en rpc endpoint [POST]:`, error);
    const code = error?.code || error?.errors?.[0]?.code;
    let message = error?.message || String(error) || "Error interno del servidor";
    if (code === "ECONNREFUSED" || /ECONNREFUSED/i.test(message)) {
      message =
        "No hay conexión a PostgreSQL. Arranca el contenedor `nix-c-postgres` o revisa DATABASE_URL en .env (puerto 5432).";
    } else if (!message || message === "Error" || message.includes("AggregateError")) {
      message = `Error de base de datos${code ? ` (${code})` : ""}. Revisa el servidor y DATABASE_URL.`;
    }
    return json({ error: message }, { status: 500 });
  }
};
