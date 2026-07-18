/**
 * Registry of all MCP actions.
 * Add a new file under this folder, then import+append here.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import * as publicMeta from "./public-meta.js";
import * as loginAgent from "./login-agent.js";
import * as sessionMe from "./session-me.js";
import * as dashboardStats from "./dashboard-stats.js";
import * as listProducts from "./list-products.js";
import * as listSales from "./list-sales.js";
import * as getSale from "./get-sale.js";
import * as createSale from "./create-sale.js";
import * as cancelSale from "./cancel-sale.js";
import * as listCashMovements from "./list-cash-movements.js";
import * as getCashBalance from "./get-cash-balance.js";
import * as vatSummary from "./vat-summary.js";
import * as listCustomers from "./list-customers.js";
import * as ollamaHealth from "./ollama-health.js";
import * as exportBackup from "./export-backup.js";
import type { ActionMeta } from "./_types.js";

type ActionModule = {
  meta: ActionMeta;
  register: (server: McpServer) => void;
};

/** Order is documentation order only; MCP does not care. */
export const actions: ActionModule[] = [
  publicMeta,
  loginAgent,
  sessionMe,
  dashboardStats,
  listProducts,
  listCustomers,
  listSales,
  getSale,
  createSale,
  cancelSale,
  listCashMovements,
  getCashBalance,
  vatSummary,
  ollamaHealth,
  exportBackup,
];

export function registerAllActions(server: McpServer): void {
  for (const action of actions) {
    action.register(server);
  }
}

export function listActionMeta(): ActionMeta[] {
  return actions.map((a) => a.meta);
}
