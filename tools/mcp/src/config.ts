/**
 * Runtime config for the MCP server.
 * Prefer env vars so each deploy (local / agent / CI) stays separate from app secrets.
 */

export type McpConfig = {
  /** Base URL of hexa-crm (no trailing slash), e.g. http://127.0.0.1:1420 */
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

function firstEnv(...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = process.env[k];
    if (v != null && String(v).trim() !== "") return v;
  }
  return undefined;
}

export function loadConfig(): McpConfig {
  // Prefer HEXA_CRM_*; fall back to legacy NIX_C_* so existing agent configs keep working.
  const rpcBaseUrl = (
    firstEnv("HEXA_CRM_URL", "HEXA_CRM_RPC_BASE", "NIX_C_URL", "NIX_C_RPC_BASE") ||
    "http://127.0.0.1:1420"
  ).replace(/\/$/, "");
  const rpcPath = firstEnv("HEXA_CRM_RPC_PATH", "NIX_C_RPC_PATH") || "/api/rpc";
  const agentToken =
    firstEnv("HEXA_CRM_AGENT_TOKEN", "HEXA_CRM_TOKEN", "NIX_C_AGENT_TOKEN", "NIX_C_TOKEN")?.trim() ||
    null;
  const timeoutMs = Number(firstEnv("HEXA_CRM_RPC_TIMEOUT_MS", "NIX_C_RPC_TIMEOUT_MS") || "60000");

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
