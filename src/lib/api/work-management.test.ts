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

  describe("Work Projects CRUD & Tri-State Filtering", () => {
    it("validates project name and dates", async () => {
      await expect(
        browserApi.upsertWorkProject({ name: "   " }, adminToken)
      ).rejects.toThrow("El nombre del proyecto es obligatorio.");

      await expect(
        browserApi.upsertWorkProject(
          {
            name: "Proyecto Alpha",
            start_date: "2026-08-10T00:00:00Z",
            target_date: "2026-08-01T00:00:00Z",
          },
          adminToken
        )
      ).rejects.toThrow("La fecha de fin no puede ser anterior a la fecha de inicio.");
    });

    it("restricts project upsert and archive to admin", async () => {
      await expect(
        browserApi.upsertWorkProject({ name: "Cajero Project" }, cajeroToken)
      ).rejects.toThrow("Solo los administradores pueden gestionar proyectos.");

      const proj = await browserApi.upsertWorkProject({ name: "Admin Project" }, adminToken);

      await expect(
        browserApi.archiveWorkProject(proj.id, cajeroToken)
      ).rejects.toThrow("Solo los administradores pueden gestionar proyectos.");
    });

    it("supports CRUD, listing by status and tri-state project_id filtering", async () => {
      const proj1 = await browserApi.upsertWorkProject(
        { name: "Project 1", status: "active" },
        adminToken
      );
      const proj2 = await browserApi.upsertWorkProject(
        { name: "Project 2", status: "planned" },
        adminToken
      );

      const activeProjects = await browserApi.listWorkProjects("active", adminToken);
      expect(activeProjects.some((p) => p.id === proj1.id)).toBe(true);
      expect(activeProjects.some((p) => p.id === proj2.id)).toBe(false);

      const fetchedProj1 = await browserApi.getWorkProject(proj1.id, adminToken);
      expect(fetchedProj1.name).toBe("Project 1");

      const itemP1 = await browserApi.upsertWorkItem(
        { title: "Task for Project 1", project_id: proj1.id },
        adminToken
      );
      const itemUnassigned = await browserApi.upsertWorkItem(
        { title: "Unassigned Task", project_id: null },
        adminToken
      );

      // Tri-state filter testing:
      // 1. undefined: all tasks
      const allItems = await browserApi.listWorkItems({}, adminToken);
      expect(allItems.some((i) => i.id === itemP1.id)).toBe(true);
      expect(allItems.some((i) => i.id === itemUnassigned.id)).toBe(true);

      // 2. number: specific project tasks
      const p1Items = await browserApi.listWorkItems({ project_id: proj1.id }, adminToken);
      expect(p1Items.every((i) => i.project_id === proj1.id)).toBe(true);
      expect(p1Items.some((i) => i.id === itemP1.id)).toBe(true);
      expect(p1Items.some((i) => i.id === itemUnassigned.id)).toBe(false);

      // 3. null: tasks without project
      const unassignedItems = await browserApi.listWorkItems({ project_id: null }, adminToken);
      expect(unassignedItems.every((i) => i.project_id === null)).toBe(true);
      expect(unassignedItems.some((i) => i.id === itemUnassigned.id)).toBe(true);
      expect(unassignedItems.some((i) => i.id === itemP1.id)).toBe(false);

      // Archive project and prevent assigning new tasks
      const archivedProj = await browserApi.archiveWorkProject(proj1.id, adminToken);
      expect(archivedProj.status).toBe("archived");

      await expect(
        browserApi.upsertWorkItem(
          { title: "Task in archived project", project_id: proj1.id },
          adminToken
        )
      ).rejects.toThrow("No se pueden crear ni asignar tareas a un proyecto archivado.");
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

  describe("Work Project CRUD & Tri-state Filtering", () => {
    it("upsertWorkProject requires admin session", async () => {
      await expect(
        browserApi.upsertWorkProject({ name: "Proyecto Cajero" }, cajeroToken)
      ).rejects.toThrow("Solo los administradores pueden gestionar proyectos.");
    });

    it("upsertWorkProject validates non-empty trimmed name", async () => {
      await expect(
        browserApi.upsertWorkProject({ name: "   " }, adminToken)
      ).rejects.toThrow("El nombre del proyecto es obligatorio.");
    });

    it("upsertWorkProject validates start_date and target_date logic", async () => {
      await expect(
        browserApi.upsertWorkProject(
          {
            name: "Proyecto Fechas Inválidas",
            start_date: "2026-05-10",
            target_date: "2026-05-01",
          },
          adminToken
        )
      ).rejects.toThrow("La fecha de fin no puede ser anterior a la fecha de inicio.");
    });

    it("supports project lifecycle: create, get, list with status filter, update, archive", async () => {
      const proj = await browserApi.upsertWorkProject(
        {
          name: "  Proyecto Rediseño  ",
          description: "Nueva interfaz de usuario",
          status: "planned",
          start_date: "2026-06-01",
          target_date: "2026-06-30",
        },
        adminToken
      );

      expect(proj.name).toBe("Proyecto Rediseño");
      expect(proj.status).toBe("planned");

      const fetched = await browserApi.getWorkProject(proj.id, adminToken);
      expect(fetched.name).toBe("Proyecto Rediseño");

      const plannedList = await browserApi.listWorkProjects("planned", adminToken);
      expect(plannedList.some((p) => p.id === proj.id)).toBe(true);

      const activeList = await browserApi.listWorkProjects("active", adminToken);
      expect(activeList.some((p) => p.id === proj.id)).toBe(false);

      const updated = await browserApi.upsertWorkProject(
        {
          id: proj.id,
          name: "Proyecto Rediseño V2",
          status: "active",
        },
        adminToken
      );
      expect(updated.name).toBe("Proyecto Rediseño V2");
      expect(updated.status).toBe("active");

      const archived = await browserApi.archiveWorkProject(proj.id, adminToken);
      expect(archived.status).toBe("archived");
    });

    it("prevents creating new tasks in an archived project", async () => {
      const proj = await browserApi.upsertWorkProject(
        { name: "Proyecto Archivable" },
        adminToken
      );
      await browserApi.archiveWorkProject(proj.id, adminToken);

      await expect(
        browserApi.upsertWorkItem(
          { title: "Nueva Tarea en Proyecto Archivado", project_id: proj.id },
          adminToken
        )
      ).rejects.toThrow("No se pueden crear ni asignar tareas a un proyecto archivado.");
    });

    it("validates project_id belongs to active company", async () => {
      await expect(
        browserApi.upsertWorkItem(
          { title: "Tarea con proyecto inexistente", project_id: 999999 },
          adminToken
        )
      ).rejects.toThrow("El proyecto no pertenece a esta empresa.");
    });

    it("supports tri-state project_id filter in listWorkItems", async () => {
      const proj = await browserApi.upsertWorkProject(
        { name: "Proyecto Alpha" },
        adminToken
      );

      const taskInProject = await browserApi.upsertWorkItem(
        { title: "Tarea Alpha 1", project_id: proj.id },
        adminToken
      );

      const taskWithoutProject = await browserApi.upsertWorkItem(
        { title: "Tarea Suelta" },
        adminToken
      );

      // undefined: returns all items
      const allItems = await browserApi.listWorkItems(
        { project_id: undefined },
        adminToken
      );
      expect(allItems.some((i) => i.id === taskInProject.id)).toBe(true);
      expect(allItems.some((i) => i.id === taskWithoutProject.id)).toBe(true);

      // number: returns only items in specific project
      const projectItems = await browserApi.listWorkItems(
        { project_id: proj.id },
        adminToken
      );
      expect(projectItems.some((i) => i.id === taskInProject.id)).toBe(true);
      expect(projectItems.some((i) => i.id === taskWithoutProject.id)).toBe(false);

      // null: returns only items without project
      const unassignedItems = await browserApi.listWorkItems(
        { project_id: null },
        adminToken
      );
      expect(unassignedItems.some((i) => i.id === taskInProject.id)).toBe(false);
      expect(unassignedItems.some((i) => i.id === taskWithoutProject.id)).toBe(true);
    });
  });
});
