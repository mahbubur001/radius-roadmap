import { randomUUID } from "node:crypto";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { signUpOwner } from "./helpers";

// The public site on a phone (doc 31).

test.use({ actionTimeout: 10_000 });

async function phone(browser: Browser) {
  const rand = () => Math.floor(Math.random() * 254) + 1;
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    extraHTTPHeaders: { "x-forwarded-for": `10.${rand()}.${rand()}.${rand()}` },
  });
  return context.newPage();
}

async function publicRoadmapUrl(page: Page, slug: string) {
  await page.goto(`/dashboard/${slug}/roadmap`);
  await page.getByRole("button", { name: "More" }).click();
  const href = await page
    .getByRole("menuitem", { name: "View public roadmap" })
    .getAttribute("href");
  await page.keyboard.press("Escape");
  if (!href) throw new Error("No public link");
  return href;
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test("on a phone: tabs, one roadmap column at a time, share an idea from the floating button", async ({
  page,
  browser,
}) => {
  const id = randomUUID().slice(0, 8);
  const { slug } = await signUpOwner(page, id);
  const roadmap = await publicRoadmapUrl(page, slug);

  const visitor = await phone(browser);
  await visitor.goto(roadmap);
  await noSidewaysScroll(visitor);

  // Every module tab is reachable in the header.
  const site = visitor.getByRole("navigation", { name: "Site" });
  await expect(site.getByRole("link", { name: "Roadmap" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(site.getByRole("link", { name: "Ideas" })).toBeVisible();

  // One column at a time, picked with the chips.
  const chips = visitor.getByRole("tablist", { name: "Roadmap columns" });
  await expect(chips.getByRole("tab", { name: /In progress/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    visitor.getByRole("region", { name: "In progress" }),
  ).toBeVisible();
  await expect(visitor.getByRole("region", { name: "Up next" })).toBeHidden();
  await chips.getByRole("tab", { name: /Up next/ }).click();
  await expect(visitor.getByRole("region", { name: "Up next" })).toBeVisible();
  await expect(
    visitor.getByRole("region", { name: "In progress" }),
  ).toBeHidden();

  // Ideas: the floating button opens the form in a sheet.
  await site.getByRole("link", { name: "Ideas" }).click();
  await noSidewaysScroll(visitor);
  await visitor.getByRole("button", { name: "Share an idea" }).click();
  const sheet = visitor.getByRole("dialog");
  await sheet.getByLabel("Title").fill("Offline mode on phones");
  await sheet.getByLabel("Name").fill("Phone Pat");
  await sheet.getByLabel("Email address").fill(`pat-${id}@example.test`);
  await sheet.getByRole("button", { name: "Submit idea" }).click();
  await expect(
    visitor.getByText("Thanks! The team will review your idea."),
  ).toBeVisible();
  await expect(
    visitor
      .getByRole("list", { name: "Your ideas" })
      .getByText("Offline mode on phones"),
  ).toBeVisible();
});
