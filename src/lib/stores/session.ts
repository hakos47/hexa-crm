import { writable, derived, get } from "svelte/store";
import type { AuthUser, Company } from "$lib/types";
import type { RemoteOperatorConfig } from "$lib/api/remote-operator";
import {
  DEFAULT_IDLE_TIMEOUT_MINUTES,
  normalizeIdleTimeoutMinutes,
} from "$lib/auth/idle-timeout";

const SESSION_KEY = "hexa-crm-session-v1";
const LEGACY_SESSION_KEY = "nix-c-session-v1";

export type SessionState = {
  user: AuthUser | null;
  token: string | null;
  ready: boolean;
  companies: Company[];
  activeCompanyId: number | null;
  remote: RemoteOperatorConfig | null;
};

function loadStored(): Pick<SessionState, "user" | "token" | "remote"> {
  if (typeof sessionStorage === "undefined") {
    return { user: null, token: null, remote: null };
  }
  try {
    let raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) {
      raw = sessionStorage.getItem(LEGACY_SESSION_KEY);
      if (raw) {
        // One-shot migrate to the new key.
        sessionStorage.setItem(SESSION_KEY, raw);
        sessionStorage.removeItem(LEGACY_SESSION_KEY);
      }
    }
    if (!raw) return { user: null, token: null, remote: null };
    const parsed = JSON.parse(raw) as { user: AuthUser; token: string; remote?: RemoteOperatorConfig | null };
    if (parsed?.user && parsed?.token) return { user: parsed.user, token: parsed.token, remote: parsed.remote ?? null };
  } catch {
    /* ignore */
  }
  return { user: null, token: null, remote: null };
}

// Never trust a stored user without server validation — only keep the token.
// User is filled after session_me succeeds.
const initial = loadStored();

export const session = writable<SessionState>({
  user: null,
  token: initial.token,
  ready: false,
  companies: [],
  activeCompanyId: null,
  remote: initial.remote,
});

export const currentUser = derived(session, ($s) => $s.user);
export const isAuthenticated = derived(session, ($s) => !!$s.user && !!$s.token);
export const isAdmin = derived(session, ($s) => $s.user?.role === "admin");
export const idleTimeoutMinutes = writable(DEFAULT_IDLE_TIMEOUT_MINUTES);
export const activeCompany = derived(session, ($s) =>
  $s.companies.find((c) => c.id === $s.activeCompanyId) ?? null,
);
export const mustChangePassword = derived(
  session,
  ($s) => !!$s.user?.must_change_password
);

export function setSession(
  user: AuthUser,
  token: string,
  opts?: { companies?: Company[]; activeCompanyId?: number | null; remote?: RemoteOperatorConfig | null },
) {
  session.update((s) => ({
    ...s,
    user,
    token,
    ready: true,
    companies: opts?.companies ?? s.companies,
    activeCompanyId:
      opts?.activeCompanyId !== undefined ? opts.activeCompanyId : s.activeCompanyId,
    remote: opts?.remote !== undefined ? opts.remote : s.remote,
  }));
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ user, token, remote: opts?.remote ?? get(session).remote }));
  }
}

export function setActiveCompanyLocal(company: Company) {
  session.update((s) => ({
    ...s,
    activeCompanyId: company.id,
    companies: s.companies.some((c) => c.id === company.id)
      ? s.companies
      : [...s.companies, company],
  }));
}

export function setCompaniesLocal(companies: Company[]) {
  session.update((state) => ({ ...state, companies }));
}

export function clearSession() {
  session.update((s) => ({
    ...s,
    user: null,
    token: null,
    ready: true,
    companies: [],
    activeCompanyId: null,
    remote: null,
  }));
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
  }
}

export function markSessionReady() {
  session.update((s) => ({ ...s, ready: true }));
}

export function setIdleTimeoutMinutes(minutes: unknown) {
  idleTimeoutMinutes.set(normalizeIdleTimeoutMinutes(minutes));
}

export function getToken(): string | null {
  return get(session).token;
}

export function requireAdmin(): AuthUser {
  const u = get(session).user;
  if (!u || u.role !== "admin") {
    throw new Error("Se requieren permisos de administrador");
  }
  return u;
}
