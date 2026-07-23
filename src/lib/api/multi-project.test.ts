import { describe, expect, it, beforeEach } from "vitest";
import { browserApi, __resetBrowserStoreForTests } from "./browser-store";
import { configureRemoteOperator } from "./client";

describe("Multi-Project API & RLS Isolation Tests", () => {
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

  it("1. creates 2 projects in same tenant with distinct IDs and same company_id", async () => {
    const proj1 = await browserApi.upsertWorkProject({ name: "Proyecto Uno" }, adminToken);
    const proj2 = await browserApi.upsertWorkProject({ name: "Proyecto Dos" }, adminToken);

    expect(proj1.id).toBeDefined();
    expect(proj2.id).toBeDefined();
    expect(proj1.id).not.toEqual(proj2.id);
    expect(proj1.company_id).toBe(1);
    expect(proj2.company_id).toBe(1);
  });

  it("2. allows projects with same name in different tenants", async () => {
    const projCompany1 = await browserApi.upsertWorkProject({ name: "Rediseño Web" }, adminToken);
    expect(projCompany1.company_id).toBe(1);

    browserApi.set_active_company(2, adminToken);

    const projCompany2 = await browserApi.upsertWorkProject({ name: "Rediseño Web" }, adminToken);
    expect(projCompany2.company_id).toBe(2);
    expect(projCompany2.name).toBe("Rediseño Web");
    expect(projCompany1.name).toBe("Rediseño Web");
    expect(projCompany1.id).not.toEqual(projCompany2.id);
  });

  it("3. lists only active company projects", async () => {
    const p1 = await browserApi.upsertWorkProject({ name: "Project SHOP" }, adminToken);

    browserApi.set_active_company(2, adminToken);
    const p2 = await browserApi.upsertWorkProject({ name: "Project DEV" }, adminToken);

    const devProjects = await browserApi.listWorkProjects("all", adminToken);
    expect(devProjects.some((p) => p.id === p2.id)).toBe(true);
    expect(devProjects.some((p) => p.id === p1.id)).toBe(false);

    browserApi.set_active_company(1, adminToken);
    const shopProjects = await browserApi.listWorkProjects("all", adminToken);
    expect(shopProjects.some((p) => p.id === p1.id)).toBe(true);
    expect(shopProjects.some((p) => p.id === p2.id)).toBe(false);
  });

  it("4. prevents cross-tenant project ID access", async () => {
    const p1 = await browserApi.upsertWorkProject({ name: "Tenant 1 Project" }, adminToken);

    browserApi.set_active_company(2, adminToken);

    await expect(
      browserApi.getWorkProject(p1.id, adminToken)
    ).rejects.toThrow("Proyecto no encontrado.");
  });

  it("5. creates tasks in different projects", async () => {
    const projA = await browserApi.upsertWorkProject({ name: "Project Alpha" }, adminToken);
    const projB = await browserApi.upsertWorkProject({ name: "Project Beta" }, adminToken);

    const taskA = await browserApi.upsertWorkItem({ title: "Task for Alpha", project_id: projA.id }, adminToken);
    const taskB = await browserApi.upsertWorkItem({ title: "Task for Beta", project_id: projB.id }, adminToken);

    expect(taskA.project_id).toBe(projA.id);
    expect(taskB.project_id).toBe(projB.id);
  });

  it("6. filters tasks by project A", async () => {
    const projA = await browserApi.upsertWorkProject({ name: "Project Alpha" }, adminToken);
    const projB = await browserApi.upsertWorkProject({ name: "Project Beta" }, adminToken);

    const taskA = await browserApi.upsertWorkItem({ title: "Task A", project_id: projA.id }, adminToken);
    await browserApi.upsertWorkItem({ title: "Task B", project_id: projB.id }, adminToken);

    const filtered = await browserApi.listWorkItems({ project_id: projA.id }, adminToken);
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe(taskA.id);
    expect(filtered[0].project_id).toBe(projA.id);
  });

  it("7. filters tasks by project B", async () => {
    const projA = await browserApi.upsertWorkProject({ name: "Project Alpha" }, adminToken);
    const projB = await browserApi.upsertWorkProject({ name: "Project Beta" }, adminToken);

    await browserApi.upsertWorkItem({ title: "Task A", project_id: projA.id }, adminToken);
    const taskB = await browserApi.upsertWorkItem({ title: "Task B", project_id: projB.id }, adminToken);

    const filtered = await browserApi.listWorkItems({ project_id: projB.id }, adminToken);
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe(taskB.id);
    expect(filtered[0].project_id).toBe(projB.id);
  });

  it("8. filters tasks without project (project_id: null)", async () => {
    const projA = await browserApi.upsertWorkProject({ name: "Project Alpha" }, adminToken);
    await browserApi.upsertWorkItem({ title: "Task A", project_id: projA.id }, adminToken);
    const unassigned = await browserApi.upsertWorkItem({ title: "Task Unassigned", project_id: null }, adminToken);

    const filtered = await browserApi.listWorkItems({ project_id: null }, adminToken);
    expect(filtered.some((i) => i.id === unassigned.id)).toBe(true);
    expect(filtered.every((i) => i.project_id === null)).toBe(true);
  });

  it("9. lists all tasks when project_id filter is undefined", async () => {
    const projA = await browserApi.upsertWorkProject({ name: "Project Alpha" }, adminToken);
    const taskA = await browserApi.upsertWorkItem({ title: "Task A", project_id: projA.id }, adminToken);
    const taskNone = await browserApi.upsertWorkItem({ title: "Task None" }, adminToken);

    const allItems = await browserApi.listWorkItems({ project_id: undefined }, adminToken);
    expect(allItems.some((i) => i.id === taskA.id)).toBe(true);
    expect(allItems.some((i) => i.id === taskNone.id)).toBe(true);
  });

  it("10. moves task between projects", async () => {
    const projA = await browserApi.upsertWorkProject({ name: "Project Alpha" }, adminToken);
    const projB = await browserApi.upsertWorkProject({ name: "Project Beta" }, adminToken);

    const task = await browserApi.upsertWorkItem({ title: "Movable Task", project_id: projA.id }, adminToken);
    expect(task.project_id).toBe(projA.id);

    const updated = await browserApi.upsertWorkItem({ id: task.id, title: "Movable Task", project_id: projB.id }, adminToken);
    expect(updated.project_id).toBe(projB.id);
  });

  it("11. removes project from task by setting project_id to null", async () => {
    const projA = await browserApi.upsertWorkProject({ name: "Project Alpha" }, adminToken);
    const task = await browserApi.upsertWorkItem({ title: "Assigned Task", project_id: projA.id }, adminToken);
    expect(task.project_id).toBe(projA.id);

    const updated = await browserApi.upsertWorkItem({ id: task.id, title: "Assigned Task", project_id: null }, adminToken);
    expect(updated.project_id).toBeNull();
  });

  it("12. archives project successfully", async () => {
    const proj = await browserApi.upsertWorkProject({ name: "Project to Archive" }, adminToken);
    const archived = await browserApi.archiveWorkProject(proj.id, adminToken);

    expect(archived.id).toBe(proj.id);
    expect(archived.status).toBe("archived");
  });

  it("13. preserves tasks and historical references when project is archived", async () => {
    const proj = await browserApi.upsertWorkProject({ name: "Project with Tasks" }, adminToken);
    const task = await browserApi.upsertWorkItem({ title: "Historical Task", project_id: proj.id }, adminToken);

    await browserApi.archiveWorkProject(proj.id, adminToken);

    const items = await browserApi.listWorkItems({ project_id: proj.id }, adminToken);
    expect(items.some((i) => i.id === task.id)).toBe(true);
    expect(items[0].project_id).toBe(proj.id);
  });

  it("14. hides archived projects from active selectors by default", async () => {
    const activeP = await browserApi.upsertWorkProject({ name: "Active Project", status: "active" }, adminToken);
    const projToArchive = await browserApi.upsertWorkProject({ name: "Project to Archive", status: "active" }, adminToken);

    await browserApi.archiveWorkProject(projToArchive.id, adminToken);

    const activeList = await browserApi.listWorkProjects("active", adminToken);
    expect(activeList.some((p) => p.id === activeP.id)).toBe(true);
    expect(activeList.some((p) => p.id === projToArchive.id)).toBe(false);

    const archivedList = await browserApi.listWorkProjects("archived", adminToken);
    expect(archivedList.some((p) => p.id === projToArchive.id)).toBe(true);
  });

  it("15. rejects target date earlier than start date", async () => {
    await expect(
      browserApi.upsertWorkProject(
        {
          name: "Fecha Inválida",
          start_date: "2026-10-15T00:00:00Z",
          target_date: "2026-10-01T00:00:00Z",
        },
        adminToken
      )
    ).rejects.toThrow("La fecha de fin no puede ser anterior a la fecha de inicio.");
  });

  it("16. rejects empty project name", async () => {
    await expect(
      browserApi.upsertWorkProject({ name: "   " }, adminToken)
    ).rejects.toThrow("El nombre del proyecto es obligatorio.");
  });

  it("17. rejects project management by cajero role", async () => {
    await expect(
      browserApi.upsertWorkProject({ name: "Cajero Project" }, cajeroToken)
    ).rejects.toThrow(/Solo los administradores pueden gestionar proyectos|Se requieren permisos/);

    const proj = await browserApi.upsertWorkProject({ name: "Admin Project" }, adminToken);

    await expect(
      browserApi.archiveWorkProject(proj.id, cajeroToken)
    ).rejects.toThrow(/Solo los administradores pueden gestionar proyectos|Se requieren permisos/);
  });

  it("18. includes workProjects in backup export", async () => {
    const proj = await browserApi.upsertWorkProject({ name: "Backup Project" }, adminToken);

    const backup = await browserApi.export_backup(adminToken);
    const payload = backup.payload as any;

    expect(payload.workProjects).toBeDefined();
    expect(Array.isArray(payload.workProjects)).toBe(true);
    expect(payload.workProjects.some((p: any) => p.id === proj.id && p.name === "Backup Project")).toBe(true);
  });

  it("19. restores projects and project_id task links without breaking state", async () => {
    const proj = await browserApi.upsertWorkProject({ name: "Restorable Project" }, adminToken);
    const task = await browserApi.upsertWorkItem({ title: "Restorable Task", project_id: proj.id }, adminToken);

    const backup = await browserApi.export_backup(adminToken);

    __resetBrowserStoreForTests();

    const postResetAdmin = await browserApi.login("admin", "1234");
    await browserApi.restore_backup(backup, postResetAdmin.token);

    const restoredLogin = await browserApi.login("admin", "1234");
    const restoredProjects = await browserApi.listWorkProjects("all", restoredLogin.token);
    const restoredTasks = await browserApi.listWorkItems({ project_id: proj.id }, restoredLogin.token);

    expect(restoredProjects.some((p) => p.id === proj.id && p.name === "Restorable Project")).toBe(true);
    expect(restoredTasks.some((t) => t.id === task.id && t.project_id === proj.id)).toBe(true);
  });

  it("20. enforces company switch URL parameter safety and access control", async () => {
    expect(() => browserApi.set_active_company(2, cajeroToken)).toThrow(/acceso/i);
    expect(() => browserApi.set_active_company(99999, adminToken)).toThrow(/acceso|no encontrada/i);
  });

  it("21. rejects creating or assigning tasks to an archived project", async () => {
    const proj = await browserApi.upsertWorkProject({ name: "Archived Project" }, adminToken);
    await browserApi.archiveWorkProject(proj.id, adminToken);

    await expect(
      browserApi.upsertWorkItem({ title: "New Task in Archived Proj", project_id: proj.id }, adminToken)
    ).rejects.toThrow("No se pueden crear ni asignar tareas a un proyecto archivado.");
  });

  it("22. keeps categories and projects independent when archiving or editing", async () => {
    const proj = await browserApi.upsertWorkProject({ name: "Project Alpha" }, adminToken);
    const task = await browserApi.upsertWorkItem(
      { title: "Task with Both", category_name: "Finanzas", project_id: proj.id },
      adminToken
    );

    const categoryId = task.category_id;
    expect(categoryId).toBeDefined();
    expect(task.project_id).toBe(proj.id);

    await browserApi.archiveWorkProject(proj.id, adminToken);
    const itemsAfterProjArchive = await browserApi.listWorkItems({ category_id: categoryId! }, adminToken);
    expect(itemsAfterProjArchive[0].category_id).toBe(categoryId);
    expect(itemsAfterProjArchive[0].project_id).toBe(proj.id);

    await browserApi.archiveWorkCategory(categoryId!, adminToken);
    const itemsAfterCatArchive = await browserApi.listWorkItems({ project_id: proj.id }, adminToken);
    expect(itemsAfterCatArchive[0].project_id).toBe(proj.id);
  });

  it("23. strictly obeys tri-state filtering semantics (undefined=all, number=project, null=no project)", async () => {
    const proj = await browserApi.upsertWorkProject({ name: "TriState Proj" }, adminToken);
    const taskInProj = await browserApi.upsertWorkItem({ title: "In Project", project_id: proj.id }, adminToken);
    const taskNoProj = await browserApi.upsertWorkItem({ title: "No Project", project_id: null }, adminToken);

    const allTasks = await browserApi.listWorkItems({ project_id: undefined }, adminToken);
    expect(allTasks.some((t) => t.id === taskInProj.id)).toBe(true);
    expect(allTasks.some((t) => t.id === taskNoProj.id)).toBe(true);

    const projTasks = await browserApi.listWorkItems({ project_id: proj.id }, adminToken);
    expect(projTasks.some((t) => t.id === taskInProj.id)).toBe(true);
    expect(projTasks.some((t) => t.id === taskNoProj.id)).toBe(false);

    const noProjTasks = await browserApi.listWorkItems({ project_id: null }, adminToken);
    expect(noProjTasks.some((t) => t.id === taskInProj.id)).toBe(false);
    expect(noProjTasks.some((t) => t.id === taskNoProj.id)).toBe(true);
  });

  it("24. enforces full multi-tenant RLS and session isolation across projects and task links", async () => {
    const projTenant1 = await browserApi.upsertWorkProject({ name: "Tenant 1 Proj" }, adminToken);
    const taskTenant1 = await browserApi.upsertWorkItem(
      { title: "Tenant 1 Task", project_id: projTenant1.id },
      adminToken
    );

    browserApi.set_active_company(2, adminToken);

    const projTenant2 = await browserApi.upsertWorkProject({ name: "Tenant 2 Proj" }, adminToken);
    const taskTenant2 = await browserApi.upsertWorkItem(
      { title: "Tenant 2 Task", project_id: projTenant2.id },
      adminToken
    );

    const tenant2Projects = await browserApi.listWorkProjects("all", adminToken);
    expect(tenant2Projects.some((p) => p.id === projTenant1.id)).toBe(false);

    const tenant2Items = await browserApi.listWorkItems({}, adminToken);
    expect(tenant2Items.some((t) => t.id === taskTenant1.id)).toBe(false);

    await expect(
      browserApi.upsertWorkItem({ title: "Cross Tenant Task", project_id: projTenant1.id }, adminToken)
    ).rejects.toThrow("El proyecto no pertenece a esta empresa.");

    browserApi.set_active_company(1, adminToken);
    const tenant1Projects = await browserApi.listWorkProjects("all", adminToken);
    expect(tenant1Projects.some((p) => p.id === projTenant1.id)).toBe(true);
    expect(tenant1Projects.some((p) => p.id === projTenant2.id)).toBe(false);

    const tenant1Items = await browserApi.listWorkItems({}, adminToken);
    expect(tenant1Items.some((t) => t.id === taskTenant1.id)).toBe(true);
    expect(tenant1Items.some((t) => t.id === taskTenant2.id)).toBe(false);
  });
});
