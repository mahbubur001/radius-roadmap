// Anonymous visitor identity for public sites (doc 19 §4.2–4.4).
// `rr_vid` = "<random id>.<HMAC>" so a visitor can't pick someone else's id.
// Web Crypto only: this runs in src/proxy.ts as well as in route handlers.

export const VISITOR_COOKIE = "rr_vid";
/** Fallback header for embeds whose cookies are blocked (third-party). */
export const VISITOR_HEADER = "x-rr-visitor";
export const VISITOR_MAX_AGE = 60 * 60 * 24 * 365;

function secret() {
  const own = process.env.VISITOR_SECRET;
  if (own) return own;
  const auth = process.env.BETTER_AUTH_SECRET;
  if (!auth)
    throw new Error("VISITOR_SECRET or BETTER_AUTH_SECRET is required");
  return `visitor:${auth}`;
}

const encoder = new TextEncoder();
let keyPromise: Promise<CryptoKey> | null = null;

function key() {
  keyPromise ??= crypto.subtle.importKey(
    "raw",
    encoder.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return keyPromise;
}

function base64url(bytes: ArrayBuffer) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(value: string) {
  return base64url(
    await crypto.subtle.sign("HMAC", await key(), encoder.encode(value)),
  );
}

/** A new signed visitor token. */
export async function newVisitorToken() {
  const id = crypto.randomUUID();
  return `${id}.${(await hmac(`vid:${id}`)).slice(0, 32)}`;
}

/** The visitor id inside a token, or null when the signature is wrong. */
export async function verifyVisitorToken(token: string | null | undefined) {
  if (!token) return null;
  const [id, sig] = token.split(".");
  if (!id || !sig || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const expected = (await hmac(`vid:${id}`)).slice(0, 32);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0 ? id : null;
}

/** HMAC of the client IP: lets us rate-limit without storing the IP. */
export async function hashIp(ip: string | null) {
  return ip ? (await hmac(`ip:${ip}`)).slice(0, 32) : null;
}

/**
 * Cloudflare's `cf-*` headers are only set by Cloudflare. Without it in front,
 * any client can send them, so they're ignored unless TRUST_CLOUDFLARE=1.
 */
function trustCloudflare() {
  return process.env.TRUST_CLOUDFLARE === "1";
}

/**
 * Client IP from proxy headers: Cloudflare's (only when trusted), then the
 * first XFF hop. Caddy replaces any client-sent XFF with the real peer address.
 */
export function clientIp(headers: Headers) {
  return (
    (trustCloudflare() ? headers.get("cf-connecting-ip") : null) ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    null
  );
}

/** Coarse location from Cloudflare headers, when the site sits behind it. */
export function clientLocation(headers: Headers) {
  if (!trustCloudflare()) return { country: null, city: null };
  const country = headers.get("cf-ipcountry");
  const city = headers.get("cf-ipcity");
  return {
    country: country && country !== "XX" ? country : null,
    city: city ? decodeURIComponent(city) : null,
  };
}

/** Cookie options: embeds need SameSite=None + Partitioned (CHIPS). */
export function visitorCookieOptions(embed: boolean, secure: boolean) {
  return embed
    ? {
        httpOnly: true,
        sameSite: "none" as const,
        secure: true,
        partitioned: true,
        path: "/",
        maxAge: VISITOR_MAX_AGE,
      }
    : {
        httpOnly: true,
        sameSite: "lax" as const,
        secure,
        path: "/",
        maxAge: VISITOR_MAX_AGE,
      };
}
