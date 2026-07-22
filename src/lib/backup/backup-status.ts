export const BACKUP_REMINDER_DAYS = 7;

export function backupAgeDays(lastBackupAt: string | null | undefined, now = Date.now()): number | null {
  if (!lastBackupAt) return null;
  const timestamp = Date.parse(lastBackupAt);
  if (!Number.isFinite(timestamp) || timestamp > now) return null;
  return Math.floor((now - timestamp) / 86_400_000);
}

export function needsBackupReminder(lastBackupAt: string | null | undefined, now = Date.now()): boolean {
  const age = backupAgeDays(lastBackupAt, now);
  return age === null || age > BACKUP_REMINDER_DAYS;
}
