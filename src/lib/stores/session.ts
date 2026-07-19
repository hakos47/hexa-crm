import { writable, derived, get } from "svelte/store";
import type { AuthUser, Company } from "$lib/types";

const SESSION_KEY = "nix-c-session-v1";

export type SessionState = {
  user: AuthUser | null;
  token: string | null;
  ready: boolean;
  companies: Company[];
  activeCompanyId: number | null;
};

function loadStored(): Pick<SessionState, "user" | "token"> {
  if (typeof sessionStorage === "undefined") {
    return { user: null, token: null };
  }
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return { user: null, token: null };
    const parsed = JSON.parse(raw) as { user: AuthUser; token: string };
    if (parsed?.user && parsed?.token) return parsed;
  } catch {
    /* ignore */
  }
  return { user: null, token: null };
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
});

export const currentUser = derived(session, ($s) => $s.user);
export const isAuthenticated = derived(session, ($s) => !!$s.user && !!$s.token);
export const isAdmin = derived(session, ($s) => $s.user?.role === "admin");
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
  opts?: { companies?: Company[]; activeCompanyId?: number | null },
) {
  session.update((s) => ({
    ...s,
    user,
    token,
    ready: true,
    companies: opts?.companies ?? s.companies,
    activeCompanyId:
      opts?.activeCompanyId !== undefined ? opts.activeCompanyId : s.activeCompanyId,
  }));
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ user, token }));
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

export function clearSession() {
  session.update((s) => ({
    ...s,
    user: null,
    token: null,
    ready: true,
    companies: [],
    activeCompanyId: null,
  }));
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(SESSION_KEY);
  }
}

export function markSessionReady() {
  session.update((s) => ({ ...s, ready: true }));
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
