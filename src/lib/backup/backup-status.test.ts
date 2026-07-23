import { describe, expect, it } from "vitest";
import { backupAgeDays, needsBackupReminder } from "./backup-status";

const NOW = Date.parse("2026-07-22T12:00:00.000Z");

describe("backup reminder", () => {
  it("asks for a copy when none exists or it is older than seven days", () => {
    expect(needsBackupReminder(null, NOW)).toBe(true);
    expect(needsBackupReminder("2026-07-14T11:59:59.000Z", NOW)).toBe(true);
  });

  it("keeps a recent valid copy quiet", () => {
    expect(backupAgeDays("2026-07-16T12:00:00.000Z", NOW)).toBe(6);
    expect(needsBackupReminder("2026-07-16T12:00:00.000Z", NOW)).toBe(false);
  });
});
