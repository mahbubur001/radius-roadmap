import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The BullMQ worker runs outside Next.js: importing a "server-only" module
// (storage, the Next cache, …) crashes it at startup. Vitest aliases
// server-only away, so service tests can't catch that; this walks the
// worker's real import graph instead.

const root = path.resolve(import.meta.dirname, "../..");
const IMPORT =
  /(?:import|export)\s[^'"]*?from\s+["']([^"']+)["']|import\s+["']([^"']+)["']/g;

function resolve(spec: string, from: string) {
  const base = spec.startsWith("@/")
    ? path.join(root, "src", spec.slice(2))
    : spec.startsWith(".")
      ? path.resolve(path.dirname(from), spec)
      : null;
  if (!base) return null;
  for (const file of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ]) {
    if (existsSync(file) && !file.endsWith(path.sep)) {
      try {
        readFileSync(file);
        return file;
      } catch {}
    }
  }
  return null;
}

function serverOnlyChain(entry: string) {
  const seen = new Set<string>();
  const walk = (file: string, chain: string[]): string[] | null => {
    if (seen.has(file)) return null;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(IMPORT)) {
      const spec = match[1] ?? match[2] ?? "";
      if (
        /^import\s+type\s/.test(match[0]) ||
        /^export\s+type\s/.test(match[0])
      ) {
        continue;
      }
      const next = [...chain, path.relative(root, file)];
      if (spec === "server-only") return next;
      const target = resolve(spec, file);
      if (target) {
        const found = walk(target, next);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(path.join(root, entry), []);
}

describe("worker imports", () => {
  it("never reach a server-only module", () => {
    expect(serverOnlyChain("worker.ts")).toBeNull();
  });

  it("does detect one (sanity check of the walker)", () => {
    // updates.ts → storage → server-only
    expect(serverOnlyChain("src/server/services/updates.ts")).toEqual(
      expect.arrayContaining(["src/server/storage/index.ts"]),
    );
  });
});
