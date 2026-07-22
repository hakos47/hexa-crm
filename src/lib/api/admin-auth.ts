import { timingSafeEqual } from "node:crypto";

export function hasMigrationAccess(authorization: string | null, expectedToken: string | undefined) {
  if (!expectedToken || !authorization?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(expectedToken);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
