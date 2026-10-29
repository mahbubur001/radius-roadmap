import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signUpOwner } from "./helpers";
import { firstLink, waitForMail } from "./mail";

// Updates / changelog (doc 23).

test.use({ actionTimeout: 10_000 });

test("announce a completed card, edit the draft, find it under Drafts", async ({
  page,
}) => {
  const id = randomUUID().slice(0, 8);
  const { slug } = await signUpOwner(page, id);

  // A card, marked complete, announced from its drawer.
  await page.goto(`/dashboard/${slug}/roadmap`);
  await page.getByRole("button", { name: "Add card to Up next" }).click();
  const input = page
    .getByRole("region", { name: "Up next" })
    .getByRole("textbox", { name: "New card title" });
  await input.fill("CSV export");
  await input.press("Enter");
  await page.getByRole("button", { name: "CSV export", exact: true }).click();
  const rail = page
    .getByRole("dialog")
    .getByRole("complementary", { name: "More options" });
  await rail.getByRole("button", { name: "Mark as complete" }).click();
  await rail.getByRole("button", { name: "Announce…" }).click();

  // The editor opens with the card's title and the card linked.
  await expect(page).toHaveURL(/\/updates\/[0-9a-f-]{36}$/);
  const title = page.getByRole("textbox", { name: "Title" });
  await expect(title).toHaveValue("CSV export");
  const settings = page.getByRole("complementary", { name: "Post settings" });
  await expect(settings.getByText("CSV export")).toBeVisible();
  await title.fill("CSV export is here");
  await settings.getByRole("combobox", { name: "Category" }).click();
  await page.getByRole("option", { name: "New feature" }).click();
  await expect(page.getByText(/^Saved ·/)).toBeVisible();

  await page.getByRole("link", { name: "Back to updates" }).click();
  await expect(page).toHaveURL(/\/updates\?tab=draft$/);
  const drafts = page.getByRole("link", { name: /CSV export is here/ });
  await expect(drafts).toBeVisible();
  await expect(drafts).toContainText("New feature");
  await expect(page.getByRole("link", { name: "Drafts (1)" })).toBeVisible();
});

test("publish a post: public Updates tab, post page and RSS; schedule another", async ({
  page,
}) => {
  const id = randomUUID().slice(0, 8);
  const { slug } = await signUpOwner(page, id);

  await page.goto(`/dashboard/${slug}/updates`);
  await page.getByRole("button", { name: "New post" }).click();
  await expect(page).toHaveURL(/\/updates\/[0-9a-f-]{36}$/);
  await page.getByRole("textbox", { name: "Title" }).fill("Hello changelog");
  await page.locator('[contenteditable="true"]').click();
  await page.keyboard.type("Our first update.");
  const publishing = page.getByRole("region", { name: "Publishing" });
  await publishing.getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByText("Published.")).toBeVisible();

  const link = publishing.getByRole("link", { name: "View public post" });
  const postUrl = await link.getAttribute("href");
  if (!postUrl) throw new Error("No public link");
  expect(postUrl).toMatch(/\/updates\/hello-changelog$/);

  // Public: the tab, the list, the post page and the feed.
  const listUrl = postUrl.replace(/\/hello-changelog$/, "");
  await page.goto(listUrl);
  const site = page.getByRole("navigation", { name: "Site" });
  await expect(site.getByRole("link", { name: "Updates" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    page.getByRole("link", { name: "Hello changelog" }),
  ).toBeVisible();
  await page.goto(postUrl);
  await expect(
    page.getByRole("heading", { level: 1, name: "Hello changelog" }),
  ).toBeVisible();
  await expect(page.getByText("Our first update.")).toBeVisible();
  const feed = await page.request.get(`${listUrl}/feed.xml`);
  expect(feed.status()).toBe(200);
  expect(await feed.text()).toContain("<title>Hello changelog</title>");

  // Another post, scheduled for tomorrow: listed under Scheduled, not public.
  await page.goto(`/dashboard/${slug}/updates`);
  await page.getByRole("button", { name: "New post" }).click();
  await expect(page).toHaveURL(/\/updates\/[0-9a-f-]{36}$/);
  await page.getByRole("textbox", { name: "Title" }).fill("Coming tomorrow");
  await expect(page.getByText(/^Saved ·/)).toBeVisible();
  await page
    .getByRole("region", { name: "Publishing" })
    .getByRole("button", { name: "Schedule…" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Schedule post" });
  await dialog.getByRole("button", { name: "Date" }).click();
  const tomorrow = new Date(Date.now() + 86_400_000);
  const month = tomorrow.toLocaleString("en", { month: "long" });
  const day = page.getByRole("button", {
    name: new RegExp(
      `${month} ${tomorrow.getDate()}(st|nd|rd|th), ${tomorrow.getFullYear()}`,
    ),
  });
  if (!(await day.count())) {
    await page.getByRole("button", { name: /next month/i }).click();
  }
  await day.click();
  await dialog.getByRole("button", { name: "Schedule", exact: true }).click();
  await expect(page.getByText(/^Scheduled for/)).toBeVisible();
  await page.goto(`/dashboard/${slug}/updates?tab=scheduled`);
  await expect(
    page.getByRole("link", { name: /Coming tomorrow/ }),
  ).toBeVisible();
  expect((await page.request.get(`${listUrl}/coming-tomorrow`)).status()).toBe(
    404,
  );
});

test("a visitor subscribes with double opt-in and shows up for the team", async ({
  page,
  browser,
}) => {
  const id = randomUUID().slice(0, 8);
  const { slug } = await signUpOwner(page, id);

  // Something must be published for the Updates tab to exist.
  await page.goto(`/dashboard/${slug}/updates`);
  await page.getByRole("button", { name: "New post" }).click();
  await expect(page).toHaveURL(/\/updates\/[0-9a-f-]{36}$/);
  await page.getByRole("textbox", { name: "Title" }).fill("First news");
  await page
    .getByRole("region", { name: "Publishing" })
    .getByRole("button", { name: "Publish now" })
    .click();
  const postUrl = await page
    .getByRole("link", { name: "View public post" })
    .getAttribute("href");
  if (!postUrl) throw new Error("No public link");
  const listUrl = postUrl.replace(/\/first-news$/, "");

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(listUrl);
  const box = visitor.getByRole("form", { name: "Get updates by email" });
  const email = `reader-${id}@example.test`;
  await box.getByRole("textbox", { name: "Email" }).fill(email);
  await box.getByRole("button", { name: "Subscribe" }).click();
  await expect(visitor.getByText("confirm your email")).toBeVisible();

  const mail = await waitForMail(email, "Confirm your subscription");
  await visitor.goto(firstLink(mail.text));
  await expect(visitor).toHaveURL(/\/updates\?subscribed=1$/);
  await expect(visitor.getByText("You're subscribed.")).toBeVisible();

  await page.goto(`/dashboard/${slug}/updates/subscribers`);
  const row = page.getByRole("row", { name: new RegExp(email) });
  await expect(row).toContainText("Active");
});
