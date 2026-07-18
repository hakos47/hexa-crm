/**
 * In-process session for agent tools after login_agent.
 * stdio MCP is single-client → one session is enough.
 */

let sessionToken: string | null = null;

export function getSessionToken(): string | null {
  return sessionToken;
}

export function setSessionToken(token: string | null): void {
  sessionToken = token;
}

export function clearSession(): void {
  sessionToken = null;
}
