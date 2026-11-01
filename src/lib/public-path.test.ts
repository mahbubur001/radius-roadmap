import { describe, expect, it } from "vitest";
import { isSiteModule, shortenPath, wsPath, wsSegment } from "./public-path";

describe("public paths (doc 26 §11)", () => {
  it("drops the default workspace's slug", () => {
    expect(wsSegment("product", "product")).toBe("");
    expect(wsSegment("other", "product")).toBe("/other");
    expect(wsSegment("other", null)).toBe("/other");
    expect(wsPath({ slug: "product", isDefault: true })).toBe("");
    expect(wsPath({ slug: "other", isDefault: false })).toBe("/other");
  });

  it("shortens redirect targets of the default workspace only", () => {
    expect(shortenPath("/product/roadmap", "product")).toBe("/roadmap");
    expect(shortenPath("/product", "product")).toBe("");
    expect(shortenPath("/productive/roadmap", "product")).toBe(
      "/productive/roadmap",
    );
    expect(shortenPath("/other/ideas", "product")).toBe("/other/ideas");
    expect(shortenPath("/product/roadmap", null)).toBe("/product/roadmap");
  });

  it("knows the module names", () => {
    expect(isSiteModule("roadmap")).toBe(true);
    expect(isSiteModule("articles")).toBe(true);
    expect(isSiteModule("product")).toBe(false);
    expect(isSiteModule(undefined)).toBe(false);
  });
});
