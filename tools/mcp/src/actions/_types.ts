/**
 * Shared shape for one MCP action module.
 * Keep each action in its own file under ./ and re-export from index.ts
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodRawShape } from "zod";

export type ActionContext = {
  /** Register this action on the MCP server */
  register: (server: McpServer) => void;
};

export type ActionMeta = {
  /** Unique tool name (snake_case) */
  name: string;
  /** Human description for the model */
  description: string;
  /** Optional category for docs */
  category: "auth" | "catalog" | "sales" | "cash" | "reports" | "system" | "ai";
};

/** Helper type for zod object shape used by server.tool */
export type InputShape = ZodRawShape;
