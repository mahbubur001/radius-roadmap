import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

// Bring the test database up to the latest migration before the run.
export default async function setup() {
  const url = process.env.DATABASE_URL;
  if (!url?.includes("test")) {
    throw new Error(`Refusing to run tests against non-test DB: ${url}`);
  }
  const pool = new Pool({ connectionString: url });
  await migrate(drizzle({ client: pool }), { migrationsFolder: "./drizzle" });
  await pool.end();
}
