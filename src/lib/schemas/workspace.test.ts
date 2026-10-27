import { describe, expect, it } from "vitest";
import { slugify, slugSchema } from "./workspace";

describe("slugSchema", () => {
  it.each(["classified-listing", "ab", "v2-roadmap"])("accepts %s", (s) => {
    expect(slugSchema.safeParse(s).success).toBe(true);
  });

  it.each([
    "A",
    "has space",
    "-lead",
    "trail-",
    "a",
    "sign-in",
    "api",
  ])("rejects %s", (s) => {
    expect(slugSchema.safeParse(s).success).toBe(false);
  });
});

describe("slugify", () => {
  it("turns names into slugs", () => {
    expect(slugify("  Classified Listing & Directory! ")).toBe(
      "classified-listing-directory",
    );
  });
});
