import { redis } from "@/server/queue/connection";

// Fixed-window counters in Redis (doc 19 §4.3). Keys expire with the window.

export type Limit = { key: string; max: number; windowSeconds: number };

/** Counts one hit against every limit; false when any is exceeded. */
export async function hit(limits: Limit[]): Promise<boolean> {
  const pipeline = redis.multi();
  for (const l of limits) {
    const key = `rl:${l.key}:${Math.floor(Date.now() / 1000 / l.windowSeconds)}`;
    pipeline.incr(key).expire(key, l.windowSeconds);
  }
  const results = (await pipeline.exec()) ?? [];
  return limits.every((l, i) => Number(results[i * 2]?.[1] ?? 0) <= l.max);
}

export const VOTE_LIMITS = {
  /** Votes (and unvotes) per IP per hour. */
  perIpHour: 30,
  /** Anonymous votes on one card from one IP per day. */
  anonymousPerCardIpDay: 3,
  /** Sign-in codes requested per IP per hour. */
  codesPerIpHour: 10,
  /** Sign-in codes requested per email per hour. */
  codesPerEmailHour: 5,
};

/** Public idea submissions per IP (doc 20 §4.2). */
export const SUBMIT_LIMITS = { perIpHour: 5, perIpDay: 20 };

/** Public comments per IP. */
export const COMMENT_LIMITS = { perIpHour: 10, perIpDay: 40 };

/** Update subscriptions: per IP, and confirmation emails per address. */
export const SUBSCRIBE_LIMITS = { perIpHour: 10, perEmailHour: 3 };
