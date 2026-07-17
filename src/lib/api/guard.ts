/** Commands that may run without a session token. */
export const PUBLIC_COMMANDS = new Set([
  "login",
  "public_meta",
  "session_me", // returns null without token
]);

export function assertTokenForCommand(cmd: string, token: string | null | undefined) {
  if (PUBLIC_COMMANDS.has(cmd)) return;
  if (!token) {
    throw new Error("Sesión no iniciada. Inicia sesión para continuar.");
  }
}
