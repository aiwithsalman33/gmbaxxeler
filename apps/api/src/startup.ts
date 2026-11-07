const SECRET_VARIABLES = ["DATABASE_URL", "JWT_SECRET", "ENCRYPTION_KEY", "MINIO_SECRET_KEY", "POSTGRES_PASSWORD", "SMTP_PASS", "SEED_ADMIN_PASSWORD", "GOOGLE_CLIENT_SECRET"];

export const startupLog = (message: string) => process.stdout.write(`[startup] ${message}\n`);

/** One line, safe to log: credentials in URLs and the values of secret variables are removed. */
export function failureText(cause: unknown, source: NodeJS.ProcessEnv = process.env): string {
  const code = typeof cause === "object" && cause && "code" in cause ? ` (${String(cause.code)})` : "";
  let text = (cause instanceof Error ? cause.message : String(cause)).replace(/\s+/g, " ").trim();
  for (const name of SECRET_VARIABLES) {
    const value = source[name];
    if (value) text = text.split(value).join("[hidden]");
  }
  text = text.replace(/:\/\/[^\s/@]*@/g, "://[hidden]@");
  return `${text.slice(0, 1000)}${code}`;
}

export function failureLine(step: string, cause: unknown, source: NodeJS.ProcessEnv = process.env): string {
  return `STARTUP FAILED: ${step}: ${failureText(cause, source)}`;
}
