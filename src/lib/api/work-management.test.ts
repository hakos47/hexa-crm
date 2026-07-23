import { describe, expect, it, beforeEach } from "vitest";
import {
  browserApi,
  __resetBrowserStoreForTests,
} from "./browser-store";
import { api, configureRemoteOperator, supportsWorkManagement } from "./client";
import type { WorkItemInput } from "../types";

describe("Trabajo Backend & API Tests", () => {
  let adminToken: string;
  let cajeroToken: string;

  beforeEach(async () => {
    __resetBrowserStoreForTests();
    configureRemoteOperator(null);

    const adminLogin = await browserApi.login("admin", "1234");
    adminToken = adminLogin.token;

    const cajeroLogin = await browserApi.login("cajero", "0000");
    cajeroToken = cajeroLogin.token;
  });

  describe("supportsWorkManagement capability function", () => {
    it("returns true for web environment without remote operator", () => {
      expect(supportsWorkManagement()).toBe(true);
    });

    it("returns false when remote operator mode is active", () => {
      configureRemoteOperator({ endpoint: "https://example.com", tenantCode: "SHOP" });
      expect(supportsWorkManagement()).toBe(false);
      configureRemoteOperator(null);
    });
  });

  describe("listWorkMembers", () => {
    it("returns active members for active company without credentials", async () => {
      const members = await browserApi.listWorkMembers(adminToken);
      expect(members).toBeDefined();
      expect(members.length).toBeGreaterThan(0);
      for (const m of members) {
        expect(m).toHaveProperty("id");
        expect(m).toHaveProperty("display_name");
        expect(m).toHaveProperty("role");
        expect((m as any).password).toBeUndefined();
        expect((m as any).username).toBeUndefined();
        expect((m as any).pin_hash).toBeUndefined();
      }
    });
  });

  describe("upsertWorkItem & category auto-creation", () => {
    it("requires title", async () => {
      await expect(
        browserApi.upsertWorkItem({ title: "   " }, adminToken)
      ).rejects.toThrow("El título es obligatorio.");
    });

    it("validates assignee belongs to active company", async () => {
      await expect(
        browserApi.upsertWorkItem({ title: "Test", assignee_id: 99999 }, adminToken)
      ).rejects.toThrow("El responsable no pertenece a esta empresa.");
    });

    it("implicitly creates category with upper-cased normalized_name", async () => {
      const item = await browserApi.upsertWorkItem(
        { title: "Comprar café", category_name: "  inventario " },
        adminToken
      );

      expect(item.category).toBeDefined();
      expect(item.category?.name).toBe("inventario");
      expect(item.category?.normalized_name).toBe("INVENTARIO");

      const categories = await browserApi.listWorkCategories(adminToken);
      const cat = categories.find((c) => c.normalized_name === "INVENTARIO");
      expect(cat).toBeDefined();

      // Reuses category on second call
      const item2 = await browserApi.upsertWorkItem(
        { title: "Comprar té", category_name: "INVENTARIO" },
        adminToken
      );
      expect(item2.category_id).toBe(cat?.id);
    });

    it("sets completed_at when status is done and null when reopened", async () => {
      const item = await browserApi.upsertWorkItem(
        { title: "Revisar stock", status: "in_progress" },
        adminToken
      );
      expect(item.completed_at).toBeNull();

      const doneItem = await browserApi.upsertWorkItem(
        { id: item.id, title: "Revisar stock", status: "done" },
        adminToken
      );
      expect(doneItem.completed_at).not.toBeNull();

      const reopenedItem = await browserApi.upsertWorkItem(
        { id: item.id, title: "Revisar stock", status: "in_progress" },
        adminToken
      );
      expect(reopenedItem.completed_at).toBeNull();
    });

    it("enforces single active task per (company_id, source_type, source_key)", async () => {
      await browserApi.upsertWorkItem(
        {
          title: "Tarea Origen A",
          source_type: "alert",
          source_key: "KEY_1",
          status: "in_progress",
        },
        adminToken
      );

      await expect(
        browserApi.upsertWorkItem(
          {
            title: "Duplicada Origen A",
            source_type: "alert",
            source_key: "KEY_1",
            status: "inbox",
          },
          adminToken
        )
      ).rejects.toThrow("Ya existe una tarea activa para este origen.");
    });
  });

  describe("Category Management Admin Permissions", () => {
    it("rejects non-admin/non-master users for rename, merge, archive", async () => {
      const cat = await browserApi.upsertWorkItem(
        { title: "Draft", category_name: "Pruebas" },
        adminToken
      );
      const catId = cat.category_id!;

      await expect(
        browserApi.renameWorkCategory(catId, "Nuevo Nombre", cajeroToken)
      ).rejects.toThrow("Solo los administradores pueden gestionar categorías.");

      await expect(
        browserApi.archiveWorkCategory(catId, cajeroToken)
      ).rejects.toThrow("Solo los administradores pueden gestionar categorías.");

      await expect(
        browserApi.mergeWorkCategory(catId, catId + 1, cajeroToken)
      ).rejects.toThrow("Solo los administradores pueden gestionar categorías.");
    });

    it("allows admin to rename, merge and archive categories", async () => {
      const cat1 = (
        await browserApi.upsertWorkItem(
          { title: "Task 1", category_name: "Cat One" },
          adminToken
        )
      ).category!;
      const cat2 = (
        await browserApi.upsertWorkItem(
          { title: "Task 2", category_name: "Cat Two" },
          adminToken
        )
      ).category!;

      const renamed = await browserApi.renameWorkCategory(cat1.id, "Cat Renamed", adminToken);
      expect(renamed.name).toBe("Cat Renamed");
      expect(renamed.normalized_name).toBe("CAT RENAMED");

      const merged = await browserApi.mergeWorkCategory(cat1.id, cat2.id, adminToken);
      expect(merged.id).toBe(cat2.id);

      const items = await browserApi.listWorkItems({ category_id: cat2.id }, adminToken);
      expect(items.length).toBe(2);

      const archived = await browserApi.archiveWorkCategory(cat2.id, adminToken);
      expect(archived.archived_at).not.toBeNull();
    });
  });

  describe("captureDashboardAlert", () => {
    it("creates task with initial category mapping for dashboard alerts", async () => {
      const stockTask = await browserApi.captureDashboardAlert(
        { alertId: "stock", title: "Bajo stock", detail: "Café bajo" },
        adminToken
      );
      expect(stockTask.category?.name).toBe("Inventario");
      expect(stockTask.source_type).toBe("dashboard_alert");
      expect(stockTask.source_key).toBe("stock");

      // Capturing same alert again returns existing task
      const existingTask = await browserApi.captureDashboardAlert(
        { alertId: "stock", title: "Bajo stock", detail: "Café bajo" },
        adminToken
      );
      expect(existingTask.id).toBe(stockTask.id);
    });
  });

  describe("Backups & Store Migration", () => {
    it("includes work arrays in export_backup and restores them cleanly", async () => {
      await browserApi.upsertWorkItem({ title: "Work Item for Backup" }, adminToken);

      const backup = await browserApi.export_backup(adminToken);
      const payload = backup.payload as any;
      expect(payload.workCategories).toBeDefined();
      expect(payload.workItems).toBeDefined();
      expect(payload.workItems.length).toBeGreaterThan(0);

      await browserApi.restore_backup(backup, adminToken);
      const postRestoreLogin = await browserApi.login("admin", "1234");
      const restoredItems = await browserApi.listWorkItems({}, postRestoreLogin.token);
      expect(restoredItems.length).toBeGreaterThan(0);
    });
  });
});
