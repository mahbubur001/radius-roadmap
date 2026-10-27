import "server-only";
import { env } from "@/lib/env";

/**
 * Cloudflare Turnstile check for anonymous and guest votes (doc 19 D3).
 * Without TURNSTILE_SECRET_KEY (local dev) every request passes.
 */
export async function verifyTurnstile(
  token: string | undefined,
  ip: string | null,
) {
  if (!env.TURNSTILE_SECRET_KEY) return true;
  if (!token) return false;
  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET_KEY,
    response: token,
  });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body },
    );
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
