import "server-only";
import crypto from "crypto";

const SECRET = process.env.APP_SECRET || "dev-insecure-secret-change-me";

export function hmac(value: string): string {
  return crypto.createHmac("sha256", SECRET).update(value).digest("hex");
}

/** Constant-time comparison to avoid timing attacks. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** Cryptographically-random N-digit numeric code. */
export function randomCode(digits = 6): string {
  const max = 10 ** digits;
  const n = crypto.randomInt(0, max);
  return String(n).padStart(digits, "0");
}

// ---- Compact signed token (our own session cookie, HMAC-SHA256) -----------

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
function b64urlDecode(input: string): Buffer {
  input = input.replace(/-/g, "+").replace(/_/g, "/");
  while (input.length % 4) input += "=";
  return Buffer.from(input, "base64");
}

export function signToken(payload: Record<string, unknown>): string {
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(
    crypto.createHmac("sha256", SECRET).update(body).digest()
  );
  return `${body}.${sig}`;
}

export function verifyToken<T = Record<string, unknown>>(
  token: string | undefined | null
): T | null {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = b64url(
    crypto.createHmac("sha256", SECRET).update(body).digest()
  );
  if (!safeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(body).toString("utf8"));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload as T;
  } catch {
    return null;
  }
}
