import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signUpOwner } from "./helpers";

// Articles / knowledge base (doc 25).

test.use({ actionTimeout: 10_000 });

test("write a help article: category, publish, public index, category, search, rating", async ({
  page,
}) => {
  const id = randomUUID().slice(0, 8);
  const { slug } = await signUpOwner(page, id);

  // A category, then an article in it.
  await page.goto(`/dashboard/${slug}/articles`);
  await page.getByRole("button", { name: "Categories" }).click();
  const dialog = page.getByRole("dialog", { name: "Article categories" });
  await dialog.getByRole("textbox", { name: "New category icon" }).fill("🚀");
  await dialog
    .getByRole("textbox", { name: "New category", exact: true })
    .fill("Getting started");
  await dialog
    .getByRole("textbox", { name: "New category description" })
    .fill("The basics");
  await dialog.getByRole("button", { name: "Add" }).click();
  await expect(
    dialog.getByRole("textbox", { name: "Category name" }),
  ).toHaveValue("Getting started");
  await page.keyboard.press("Escape");

  await page.getByRole("link", { name: /Getting started/ }).click();
  // "New article" files the draft in the category being viewed.
  await expect(page).toHaveURL(/category=[0-9a-f-]{36}/);
  await expect(
    page.getByRole("link", { name: /Getting started/ }),
  ).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "New article" }).click();
  await expect(page).toHaveURL(/\/articles\/[0-9a-f-]{36}$/);
  await page.getByRole("textbox", { name: "Title" }).fill("Invite your team");
  await page.locator('[contenteditable="true"]').click();
  await page.keyboard.type("Open Settings, then Team, and send invitations.");
  await expect(page.getByText(/^Saved ·/)).toBeVisible();
  const settings = page.getByRole("complementary", {
    name: "Article settings",
  });
  await expect(
    settings.getByRole("combobox", { name: "Category" }),
  ).toContainText("Getting started");
  await settings.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Published.")).toBeVisible();
  const link = settings.getByRole("link", { name: "View public article" });
  const articleUrl = await link.getAttribute("href");
  if (!articleUrl) throw new Error("No public link");
  expect(articleUrl).toMatch(/\/articles\/invite-your-team$/);

  // Public: the tab, recent articles, the category card, search.
  const home = articleUrl.replace(/\/invite-your-team$/, "");
  await page.goto(home);
  const site = page.getByRole("navigation", { name: "Site" });
  await expect(site.getByRole("link", { name: "Articles" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    page
      .getByRole("list", { name: "Recent articles" })
      .getByRole("link", { name: /Invite your team/ }),
  ).toBeVisible();
  await page
    .getByRole("list", { name: "Categories" })
    .getByRole("link", { name: /Getting started/ })
    .click();
  await expect(
    page.getByRole("heading", { name: /Getting started/ }),
  ).toBeVisible();

  const search = page.getByRole("searchbox", { name: "Search articles" });
  await search.fill("invitat");
  await search.press("Enter");
  await expect(page.getByText("1 result for “invitat”")).toBeVisible();
  await page.getByRole("link", { name: /Invite your team/ }).click();

  // The article page and "Was this helpful?".
  await expect(
    page.getByRole("heading", { name: "Invite your team" }),
  ).toBeVisible();
  await expect(
    page.getByRole("article").getByText("Open Settings, then Team"),
  ).toBeVisible();
  const helpful = page.getByRole("button", { name: "Helpful", exact: true });
  await helpful.click();
  await expect(page.getByText("Thanks for your feedback!")).toBeVisible();
  await expect(helpful).toHaveAttribute("aria-pressed", "true");

  // The team sees the rating.
  await page.goto(`/dashboard/${slug}/articles`);
  await expect(
    page.getByText("Likes").locator("..").getByText("1"),
  ).toBeVisible();

  // A missing article is a real 404.
  const missing = await page.request.get(`${home}/nope`);
  expect(missing.status()).toBe(404);
});
