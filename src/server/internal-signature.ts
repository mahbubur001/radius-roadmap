import { createHmac, timingSafeEqual } from "node:crypto";

// Signed calls from the worker to the web app (e.g. "drop this workspace's
// public cache" after a scheduled post goes live). HMAC over the payload and
// a timestamp, keyed with the auth secret; valid for 5 minutes.

const WINDOW_MS = 5 * 60 * 1000;

export function signInternal(secret: string, payload: string, ts: number) {
  return createHmac("sha256", `internal:${secret}`)
    .update(`${ts}.${payload}`)
    .digest("base64url");
}

export function verifyInternal(
  secret: string,
  payload: string,
  ts: number,
  signature: string,
  now = Date.now(),
) {
  if (!Number.isFinite(ts) || Math.abs(now - ts) > WINDOW_MS) return false;
  const expected = Buffer.from(signInternal(secret, payload, ts));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Long-lived link signatures (unsubscribe links in emails): HMAC of a
 * payload, no expiry, so links in old emails keep working.
 */
export function signLink(secret: string, payload: string) {
  return createHmac("sha256", `link:${secret}`)
    .update(payload)
    .digest("base64url");
}

export function verifyLink(secret: string, payload: string, signature: string) {
  const expected = Buffer.from(signLink(secret, payload));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
