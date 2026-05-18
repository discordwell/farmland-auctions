import "dotenv/config";

function numberFromEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number`);
  }
  return value;
}

export const config = {
  adminApiKey: process.env.ADMIN_API_KEY ?? "",
  corsOrigin: (process.env.CORS_ORIGIN ?? "http://localhost:3000,http://127.0.0.1:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  databaseUrl: process.env.DATABASE_URL ?? "",
  host: process.env.API_HOST ?? "127.0.0.1",
  opsNotifyEmail: process.env.OPS_NOTIFY_EMAIL ?? "",
  port: numberFromEnv("API_PORT", 3510),
  publicSiteUrl: process.env.PUBLIC_SITE_URL ?? "https://farmauction.discordwell.com",
  smtp: {
    from: process.env.SMTP_FROM ?? "",
    host: process.env.SMTP_HOST ?? "",
    password: process.env.SMTP_PASSWORD ?? "",
    port: numberFromEnv("SMTP_PORT", 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER ?? ""
  }
};

if (!config.databaseUrl) {
  throw new Error("DATABASE_URL is required");
}
