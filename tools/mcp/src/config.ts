/**
 * Runtime config for the MCP server.
 * Prefer env vars so each deploy (local / agent / CI) stays separate from app secrets.
 */

export type McpConfig = {
  /** Base URL of Nix-C (no trailing slash), e.g. http://127.0.0.1:1420 */
  rpcBaseUrl: string;
  /** Path to RPC endpoint */
  rpcPath: string;
  /**
   * Optional pre-shared agent token (Bearer).
   * If set, every RPC call uses it unless a tool overrides via session.
   */
  agentToken: string | null;
  /** Request timeout ms */
  timeoutMs: number;
};

export function loadConfig(): McpConfig {
  const rpcBaseUrl = (process.env.NIX_C_URL || process.env.NIX_C_RPC_BASE || "http://127.0.0.1:1420").replace(
    /\/$/,
    "",
  );
  const rpcPath = process.env.NIX_C_RPC_PATH || "/api/rpc";
  const agentToken = process.env.NIX_C_AGENT_TOKEN?.trim() || process.env.NIX_C_TOKEN?.trim() || null;
  const timeoutMs = Number(process.env.NIX_C_RPC_TIMEOUT_MS || "60000");

  return {
    rpcBaseUrl,
    rpcPath,
    agentToken,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 60_000,
  };
}

export function rpcUrl(cfg: McpConfig): string {
  return `${cfg.rpcBaseUrl}${cfg.rpcPath.startsWith("/") ? cfg.rpcPath : `/${cfg.rpcPath}`}`;
}
