import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

function env(name, fallback = undefined) {
  const raw = process.env[name];
  if (raw === undefined || raw === null) return fallback;
  return String(raw).trim();
}

export function isPlaceholder(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return (
    !normalized ||
    normalized.startsWith("your_") ||
    normalized.includes("yourdomain.com") ||
    normalized.includes("placeholder") ||
    normalized === "changeme"
  );
}

function requireEnv(name) {
  const value = env(name);
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

export const settings = {
  paypalClientId: requireEnv("PAYPAL_CLIENT_ID"),
  paypalSecret: requireEnv("PAYPAL_CLIENT_SECRET"),
  paypalMode: requireEnv("PAYPAL_MODE").toLowerCase(),
  host: env("HOST", "0.0.0.0"),
  port: Number(env("PORT", "8080")),
  supabaseUrl: requireEnv("SUPABASE_URL").replace(/\/+$/, ""),
  supabaseKey:
    env("SUPABASE_SERVICE_KEY") ||
    env("SUPABASE_ANON_KEY") ||
    (() => {
      throw new Error("SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY must be set");
    })(),
  smtpServer: env("SMTP_SERVER", "smtp.resend.com"),
  smtpPort: Number(env("SMTP_PORT", "587")),
  smtpUsername: env("SMTP_USERNAME", "resend"),
  smtpPassword: env("SMTP_PASSWORD", ""),
  senderEmail: env("SENDER_EMAIL", ""),
  resendApiKey: env("RESEND_API_KEY", "") || env("SMTP_PASSWORD", ""),
  paypalWebhookId: env("PAYPAL_WEBHOOK_ID", ""),
  adminUsername: env("ADMIN_USERNAME", "adminmoctam"),
  adminPassword: env("ADMIN_PASSWORD", "123456"),
  jwtSecret: env("JWT_SECRET", "secret"),
};
