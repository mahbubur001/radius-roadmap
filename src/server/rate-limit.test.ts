import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { redis } from "@/server/queue/connection";
import { hit, VOTE_LIMITS } from "./rate-limit";
import { clientIp, clientLocation } from "./visitor";

afterAll(async () => {
  await redis.quit();
});

describe("hit", () => {
  it("allows up to max hits in a window, then trips", async () => {
    const limit = { key: `test:${randomUUID()}`, max: 3, windowSeconds: 60 };
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await hit([limit]));
    expect(results).toEqual([true, true, true, false, false]);
  });

  it("trips when any one of several limits is exceeded", async () => {
    const wide = { key: `test:${randomUUID()}`, max: 100, windowSeconds: 60 };
    const narrow = { key: `test:${randomUUID()}`, max: 1, windowSeconds: 60 };
    expect(await hit([wide, narrow])).toBe(true);
    expect(await hit([wide, narrow])).toBe(false);
    expect(await hit([wide])).toBe(true);
  });

  it("sets an expiry on the counter", async () => {
    const limit = { key: `test:${randomUUID()}`, max: 1, windowSeconds: 60 };
    await hit([limit]);
    const [key] = await redis.keys(`rl:${limit.key}:*`);
    const ttl = await redis.ttl(key as string);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it("anonymous votes on one card trip after the daily limit", async () => {
    const limit = {
      key: `vote:anon:${randomUUID()}:${randomUUID()}`,
      max: VOTE_LIMITS.anonymousPerCardIpDay,
      windowSeconds: 86_400,
    };
    for (let i = 0; i < VOTE_LIMITS.anonymousPerCardIpDay; i++) {
      expect(await hit([limit])).toBe(true);
    }
    expect(await hit([limit])).toBe(false);
  });
});

describe("clientIp", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const headers = new Headers({
    "cf-connecting-ip": "6.6.6.6",
    "x-forwarded-for": "1.2.3.4, 10.0.0.1",
    "cf-ipcountry": "DE",
  });

  it("ignores Cloudflare headers unless TRUST_CLOUDFLARE=1", () => {
    vi.stubEnv("TRUST_CLOUDFLARE", "0");
    expect(clientIp(headers)).toBe("1.2.3.4");
    expect(clientLocation(headers).country).toBeNull();
  });

  it("uses Cloudflare headers when trusted", () => {
    vi.stubEnv("TRUST_CLOUDFLARE", "1");
    expect(clientIp(headers)).toBe("6.6.6.6");
    expect(clientLocation(headers).country).toBe("DE");
  });

  it("falls back to x-real-ip, then null", () => {
    expect(clientIp(new Headers({ "x-real-ip": "5.5.5.5" }))).toBe("5.5.5.5");
    expect(clientIp(new Headers())).toBeNull();
  });
});
