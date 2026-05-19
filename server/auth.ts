import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "./config.js";
import { ApiError } from "./errors.js";
import { query } from "./db/pool.js";

function scryptAsync(password: string, salt: Buffer, keylen: number, cost: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, { cost }, (err, derived) => {
      if (err) reject(err);
      else resolve(derived as Buffer);
    });
  });
}

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16_384;
export const SESSION_COOKIE = "farmauction_session";
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type AuthRole = "admin" | "user";
export type UserIntent = "buyer" | "seller" | "both" | null;

export type SessionUser = {
  id: string;
  email: string;
  role: AuthRole;
  displayName: string;
  intent: UserIntent;
};

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN, SCRYPT_COST);
  return `scrypt$${SCRYPT_COST}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 4 || parts[0] !== "scrypt") return false;
  const cost = Number(parts[1]);
  if (!Number.isFinite(cost) || cost <= 0) return false;
  const salt = Buffer.from(parts[2], "base64");
  const expected = Buffer.from(parts[3], "base64");
  const derived = await scryptAsync(password, salt, expected.length, cost);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const pair of header.split(/;\s*/)) {
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

function buildSetCookie(value: string, expiresAt: Date | null): string {
  const segments = [`${SESSION_COOKIE}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (expiresAt) {
    segments.push(`Expires=${expiresAt.toUTCString()}`);
  } else {
    segments.push("Max-Age=0", "Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  }
  if (config.cookieSecure) segments.push("Secure");
  return segments.join("; ");
}

export async function createSession(userId: string, userAgent: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await query(
    `
      INSERT INTO user_sessions (user_id, token_hash, expires_at, user_agent)
      VALUES ($1, $2, $3, $4)
    `,
    [userId, tokenHash(token), expiresAt, userAgent.slice(0, 500)]
  );
  return { token, expiresAt };
}

export async function destroySession(token: string) {
  await query("DELETE FROM user_sessions WHERE token_hash = $1", [tokenHash(token)]);
}

export function attachSessionCookie(reply: FastifyReply, token: string, expiresAt: Date) {
  reply.header("set-cookie", buildSetCookie(token, expiresAt));
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.header("set-cookie", buildSetCookie("", null));
}

type UserRow = {
  id: string;
  email: string;
  role: AuthRole;
  display_name: string;
  intent: UserIntent;
};

function rowToUser(row: UserRow): SessionUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    displayName: row.display_name,
    intent: row.intent ?? null
  };
}

export async function getSessionUser(request: FastifyRequest): Promise<SessionUser | null> {
  const cookies = parseCookies(request.headers.cookie);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const result = await query<UserRow & { expires_at: string }>(
    `
      SELECT u.id, u.email, u.role, u.display_name, u.intent, s.expires_at
      FROM user_sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
      LIMIT 1
    `,
    [tokenHash(token)]
  );
  if (!result.rowCount) return null;
  const row = result.rows[0];
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await query("DELETE FROM user_sessions WHERE token_hash = $1", [tokenHash(token)]);
    return null;
  }
  void query("UPDATE user_sessions SET last_seen_at = now() WHERE token_hash = $1", [
    tokenHash(token)
  ]).catch(() => undefined);
  return rowToUser(row);
}

export async function requireAdmin(request: FastifyRequest): Promise<SessionUser | null> {
  const user = await getSessionUser(request);
  if (user?.role === "admin") return user;
  if (config.adminApiKey) {
    const header = request.headers["x-admin-key"];
    const key = Array.isArray(header) ? header[0] : header;
    if (key && key === config.adminApiKey) return null;
  }
  throw new ApiError(401, "Admin access required");
}

export async function requireUser(request: FastifyRequest): Promise<SessionUser> {
  const user = await getSessionUser(request);
  if (!user) throw new ApiError(401, "Sign in to continue");
  return user;
}

export async function findUserByEmail(email: string) {
  const result = await query<UserRow & { password_hash: string }>(
    "SELECT id, email, password_hash, role, display_name, intent FROM users WHERE lower(email) = lower($1) LIMIT 1",
    [email]
  );
  return result.rows[0] ?? null;
}

export async function createUser(input: {
  email: string;
  password: string;
  displayName?: string;
  role?: AuthRole;
  intent?: UserIntent;
}) {
  const passwordHash = await hashPassword(input.password);
  const result = await query<UserRow>(
    `
      INSERT INTO users (email, password_hash, display_name, role, intent)
      VALUES (lower($1), $2, $3, $4, $5)
      RETURNING id, email, role, display_name, intent
    `,
    [
      input.email,
      passwordHash,
      input.displayName ?? "",
      input.role ?? "user",
      input.intent ?? null
    ]
  );
  return rowToUser(result.rows[0]);
}

export async function touchLogin(userId: string) {
  await query("UPDATE users SET last_login_at = now() WHERE id = $1", [userId]);
}
