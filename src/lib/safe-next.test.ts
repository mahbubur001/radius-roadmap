import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/accept-invite/abc", "/")).toBe("/accept-invite/abc");
  });

  it.each([
    null,
    "",
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "javascript:x",
  ])("falls back for %s", (value) => {
    expect(safeNext(value, "/")).toBe("/");
  });
});
