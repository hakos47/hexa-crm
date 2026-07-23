/**
 * Company Tenant helpers (ciclo 7 — multi-empresa P0 slice).
 * Pure isolation logic; backends attach company_id and filter with these.
 */
import type { Company, CompanyMember, UserRole } from "../types";

export const DEFAULT_COMPANY_CODE = "SHOP";

export function seedCompanies(createdAt: string): Company[] {
  return [
    {
      id: 1,
      code: "SHOP",
      legal_name: "Compraventa Nix S.L.",
      trade_name: "Mi Tienda",
      nif: "B00000000",
      kind: "retail_secondhand",
      active: true,
      created_at: createdAt,
    },
    {
      id: 2,
      code: "DEV",
      legal_name: "HEXA Desarrollo S.L.",
      trade_name: "HEXA Studio",
      nif: "B00000001",
      kind: "software_studio",
      active: true,
      created_at: createdAt,
    },
  ];
}

/** Admin member of both; cajero only SHOP by default. */
export function seedCompanyMembers(userIds: {
  adminId: number;
  cajeroId: number;
}): CompanyMember[] {
  return [
    { company_id: 1, user_id: userIds.adminId, role: "admin" },
    { company_id: 2, user_id: userIds.adminId, role: "admin" },
    { company_id: 1, user_id: userIds.cajeroId, role: "cajero" },
  ];
}

export function companiesForUser(
  userId: number,
  members: CompanyMember[],
  companies: Company[],
): Company[] {
  const ids = new Set(
    members.filter((m) => m.user_id === userId).map((m) => m.company_id),
  );
  return companies.filter((c) => c.active && ids.has(c.id));
}

export function canAccessCompany(
  userId: number,
  companyId: number,
  members: CompanyMember[],
  isMaster = false,
): boolean {
  return isMaster || members.some((m) => m.user_id === userId && m.company_id === companyId);
}

/** Normal users see memberships; a master may explicitly expand the global tenant catalog. */
export function companiesVisibleToUser(
  userId: number,
  members: CompanyMember[],
  companies: Company[],
  opts: { isMaster?: boolean; includeAll?: boolean } = {},
): Company[] {
  if (opts.isMaster && opts.includeAll) return companies.filter((company) => company.active);
  return companiesForUser(userId, members, companies);
}

export function pickDefaultCompanyId(
  accessible: Company[],
  preferredId?: number | null,
): number | null {
  if (!accessible.length) return null;
  if (preferredId != null && accessible.some((c) => c.id === preferredId)) {
    return preferredId;
  }
  const shop = accessible.find((c) => c.code === DEFAULT_COMPANY_CODE);
  return (shop ?? accessible[0]).id;
}

export function filterByCompanyId<T extends { company_id?: number | null }>(
  rows: T[],
  companyId: number | null | undefined,
): T[] {
  if (companyId == null) return rows;
  return rows.filter((r) => (r.company_id ?? 1) === companyId);
}

export function memberRole(
  userId: number,
  companyId: number,
  members: CompanyMember[],
): UserRole | null {
  const m = members.find((x) => x.user_id === userId && x.company_id === companyId);
  return m?.role ?? null;
}

/** Report: totals per company from sales rows (completed only). */
export function billingByCompany(
  sales: { company_id?: number | null; total_cents: number; status?: string }[],
  companies: Company[],
): { company_id: number; code: string; trade_name: string; sales_count: number; total_cents: number }[] {
  return companies.map((c) => {
    const rows = sales.filter(
      (s) => (s.company_id ?? 1) === c.id && (!s.status || s.status === "completed"),
    );
    return {
      company_id: c.id,
      code: c.code,
      trade_name: c.trade_name,
      sales_count: rows.length,
      total_cents: rows.reduce((a, s) => a + s.total_cents, 0),
    };
  });
}
