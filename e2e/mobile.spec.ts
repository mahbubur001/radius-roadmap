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

async function addCard(page: Page, column: string, title: string) {
  await page.getByRole("button", { name: `Add card to ${column}` }).click();
  const input = page
    .getByRole("region", { name: column })
    .getByRole("textbox", { name: "New card title" });
  await input.fill(title);
  await input.press("Enter");
  await expect(
    page.getByRole("button", { name: title, exact: true }),
  ).toBeVisible();
  await input.press("Escape");
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test("on a phone: the dock, the vertical line, share an idea from the dock", async ({
  page,
  browser,
}) => {
  const id = randomUUID().slice(0, 8);
  const { slug } = await signUpOwner(page, id);
  await page.goto(`/dashboard/${slug}/roadmap`);
  await addCard(page, "In progress", "Phone layout");
  await addCard(page, "Up next", "Tablet layout");
  const roadmap = await publicRoadmapUrl(page, slug);

  const visitor = await phone(browser);
  await visitor.goto(roadmap);
  await noSidewaysScroll(visitor);

  // Every module is reachable in the bottom dock (doc 32).
  const site = visitor.getByRole("navigation", { name: "Site sections" });
  await expect(site.getByRole("link", { name: "Roadmap" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(site.getByRole("link", { name: "Ideas" })).toBeVisible();

  // The line runs down the page: every station in one scroll.
  await expect(
    visitor.getByRole("region", { name: "In progress" }),
  ).toBeVisible();
  await expect(visitor.getByRole("region", { name: "Up next" })).toBeVisible();

  // Ideas: the dock's + opens the form in a sheet.
  await site.getByRole("link", { name: "Ideas" }).click();
  await noSidewaysScroll(visitor);
  await site.getByRole("link", { name: "Share an idea" }).click();
  const sheet = visitor.getByRole("dialog");
  await sheet.getByLabel("Title").fill("Offline mode on phones");
  await sheet.getByLabel("Name").fill("Phone Pat");
  await sheet.getByLabel("Email address").fill(`pat-${id}@example.test`);
  await sheet.getByRole("button", { name: "Post idea" }).click();
  await expect(
    visitor.getByText("Thanks! The team will review your idea."),
  ).toBeVisible();
  await expect(
    visitor
      .getByRole("list", { name: "Your ideas" })
      .getByText("Offline mode on phones"),
  ).toBeVisible();
});
