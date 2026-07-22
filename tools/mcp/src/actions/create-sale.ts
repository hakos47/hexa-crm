import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callRpc, errorResult, textResult } from "../rpc-client.js";
import type { ActionMeta } from "./_types.js";

export const meta: ActionMeta = {
  name: "create_sale",
  description:
    "Crea una venta (ticket). Precios PVP con IVA. discount_cents es descuento en céntimos por línea (opcional). Descuenta stock y registra caja.",
  category: "sales",
};

const lineSchema = z.object({
  product_id: z.number().int().positive(),
  qty: z.number().int().positive(),
  unit_price_cents: z.number().int().nonnegative().optional(),
  discount_cents: z.number().int().nonnegative().optional(),
});

const input = {
  lines: z.array(lineSchema).min(1).describe("Líneas del ticket"),
  customer_id: z.number().int().positive().nullable().optional(),
  notes: z.string().optional(),
};

export function register(server: McpServer): void {
  server.tool(meta.name, meta.description, input, async (args) => {
    try {
      const data = await callRpc("create_sale", {
        lines: args.lines,
        customer_id: args.customer_id ?? null,
        notes: args.notes ?? "",
      });
      return textResult(data);
    } catch (e) {
      return errorResult(e);
    }
  });
}
