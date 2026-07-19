/**
 * Thin client to hexa-crm POST /api/rpc
 */

import { loadConfig, rpcUrl, type McpConfig } from "./config.js";
import { getSessionToken } from "./session.js";

export class RpcError extends Error {
  constructor(
    message: string,
    public status?: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = "RpcError";
  }
}

export async function callRpc<T = unknown>(
  cmd: string,
  args: Record<string, unknown> = {},
  opts?: { token?: string | null; config?: McpConfig },
): Promise<T> {
  const cfg = opts?.config ?? loadConfig();
  const token =
    opts?.token !== undefined
      ? opts.token
      : getSessionToken() ?? cfg.agentToken;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

  try {
    const res = await fetch(rpcUrl(cfg), {
      method: "POST",
      headers,
      body: JSON.stringify({ cmd, args }),
      signal: controller.signal,
    });

    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      [k: string]: unknown;
    };

    if (!res.ok) {
      throw new RpcError(
        data.error || `RPC HTTP ${res.status} for cmd=${cmd}`,
        res.status,
        data,
      );
    }
    if (data && typeof data === "object" && "error" in data && data.error) {
      throw new RpcError(String(data.error), res.status, data);
    }
    return data as T;
  } catch (e) {
    if (e instanceof RpcError) throw e;
    if (e instanceof Error && e.name === "AbortError") {
      throw new RpcError(`Timeout calling ${cmd} (${cfg.timeoutMs}ms)`);
    }
    throw new RpcError(e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
}

export function textResult(payload: unknown): { content: { type: "text"; text: string }[] } {
  const text =
    typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  return { content: [{ type: "text", text }] };
}

export function errorResult(err: unknown): {
  content: { type: "text"; text: string }[];
  isError: true;
} {
  const msg = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: "text", text: `Error: ${msg}` }],
  };
}
