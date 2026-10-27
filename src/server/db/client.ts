import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

// Reuse one pool across Next.js hot reloads in development.
const globalForDb = globalThis as typeof globalThis & { pgPool?: Pool };

const pool =
  globalForDb.pgPool ?? new Pool({ connectionString: env.DATABASE_URL });

if (env.NODE_ENV !== "production") globalForDb.pgPool = pool;

export const db = drizzle({ client: pool, schema, casing: "snake_case" });

export type Db = typeof db;
