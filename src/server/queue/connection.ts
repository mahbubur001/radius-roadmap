import { Redis } from "ioredis";
import { env } from "@/lib/env";

// BullMQ needs maxRetriesPerRequest: null so workers block until Redis returns.
export function createRedisConnection() {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

const globalForRedis = globalThis as typeof globalThis & { redis?: Redis };

// Shared connection for producers (Next.js server). Workers create their own.
export const redis = globalForRedis.redis ?? createRedisConnection();

if (env.NODE_ENV !== "production") globalForRedis.redis = redis;
