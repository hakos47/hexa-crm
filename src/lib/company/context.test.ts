import { describe, expect, it } from "vitest";
import {
  billingByCompany,
  canAccessCompany,
  companiesForUser,
  companiesVisibleToUser,
  filterByCompanyId,
  pickDefaultCompanyId,
  seedCompanies,
  seedCompanyMembers,
} from "./context";

const t = "2026-07-18T00:00:00.000Z";
const companies = seedCompanies(t);
const members = seedCompanyMembers({ adminId: 1, cajeroId: 2 });

describe("company access", () => {
  it("admin sees both companies; cajero only SHOP", () => {
    const adminCos = companiesForUser(1, members, companies);
    expect(adminCos.map((c) => c.code).sort()).toEqual(["DEV", "SHOP"]);
    const cajeroCos = companiesForUser(2, members, companies);
    expect(cajeroCos.map((c) => c.code)).toEqual(["SHOP"]);
    expect(canAccessCompany(2, 2, members)).toBe(false);
    expect(canAccessCompany(1, 2, members)).toBe(true);
  });

  it("pickDefaultCompany prefers SHOP then preferred id", () => {
    const adminCos = companiesForUser(1, members, companies);
    expect(pickDefaultCompanyId(adminCos)).toBe(1);
    expect(pickDefaultCompanyId(adminCos, 2)).toBe(2);
    expect(pickDefaultCompanyId(adminCos, 99)).toBe(1);
  });

  it("master keeps assigned companies until explicitly expanding all tenants", () => {
    const assigned = companiesVisibleToUser(2, members, companies, {
      isMaster: true,
      includeAll: false,
    });
    const expanded = companiesVisibleToUser(2, members, companies, {
      isMaster: true,
      includeAll: true,
    });
    expect(assigned.map((company) => company.code)).toEqual(["SHOP"]);
    expect(expanded.map((company) => company.code).sort()).toEqual(["DEV", "SHOP"]);
    expect(canAccessCompany(2, 2, members, true)).toBe(true);
  });
});

describe("filterByCompanyId", () => {
  it("isolates rows by company_id (default legacy 1)", () => {
    const rows = [
      { id: 1, company_id: 1, total_cents: 100 },
      { id: 2, company_id: 2, total_cents: 200 },
      { id: 3, total_cents: 50 },
    ];
    expect(filterByCompanyId(rows, 1).map((r) => r.id)).toEqual([1, 3]);
    expect(filterByCompanyId(rows, 2).map((r) => r.id)).toEqual([2]);
  });
});

describe("billingByCompany", () => {
  it("sums completed sales per company without mixing", () => {
    const sales = [
      { company_id: 1, total_cents: 1000, status: "completed" },
      { company_id: 1, total_cents: 500, status: "cancelled" },
      { company_id: 2, total_cents: 3000, status: "completed" },
    ];
    const report = billingByCompany(sales, companies);
    const shop = report.find((r) => r.code === "SHOP")!;
    const dev = report.find((r) => r.code === "DEV")!;
    expect(shop.sales_count).toBe(1);
    expect(shop.total_cents).toBe(1000);
    expect(dev.sales_count).toBe(1);
    expect(dev.total_cents).toBe(3000);
  });
});
