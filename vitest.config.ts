import { resolve } from "node:path";
import { config } from "dotenv";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

config({ path: ".env.local", quiet: true });

// Tests always run against the separate test database.
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL?.replace(/\/([^/?]+)(\?|$)/, "/$1_test$2");

// Set before anything reads it: globalSetup runs in this process and does not
// receive `test.env`.
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl;

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
    globalSetup: ["./src/test/global-setup.ts"],
    // Server modules guard against client imports; tests run on the server.
    alias: {
      "server-only": resolve(import.meta.dirname, "src/test/server-only.ts"),
    },
    env: {
      NODE_ENV: "test",
      DATABASE_URL: testDatabaseUrl ?? "",
      EMAIL_TRANSPORT: "console",
    },
    fileParallelism: false,
  },
});
