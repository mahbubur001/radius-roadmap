import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { signUpOwner } from "./helpers";
import { waitForMail } from "./mail";

// Phase 2 flows (doc 19 §6). Each test signs up its own account, so the
// public site lives at /<account-slug>/<workspace> (doc 19, D1 revised).

/** A fresh browser context with its own client IP, so rate limits don't collide. */
async function visitor(browser: Browser) {
  const ip = `10.${rand()}.${rand()}.${rand()}`;
  const context = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": ip },
  });
  return context.newPage();
}

function rand() {
  return Math.floor(Math.random() * 254) + 1;
}

async function openRoadmap(page: Page, slug: string) {
  await page.goto(`/dashboard/${slug}/roadmap`);
  await expect(page.getByRole("region", { name: "Up next" })).toBeVisible();
}

async function addCard(page: Page, column: string, title: string) {
  await page.getByRole("button", { name: `Add card to ${column}` }).click();
  const input = page
    .getByRole("region", { name: column })
    .getByRole("textbox", { name: "New card title" });
  await input.fill(title);
  await input.press("Enter");
  await expect(cardButton(page, title)).toBeVisible();
  await input.press("Escape");
}

function cardButton(page: Page, title: string) {
  return page.getByRole("button", { name: title, exact: true });
}

/** Opens the card drawer and returns it. */
async function openCard(page: Page, title: string) {
  await cardButton(page, title).click();
  const drawer = page.getByRole("dialog");
  await expect(
    drawer.getByRole("textbox", { name: "Title", exact: true }),
  ).toHaveValue(title);
  return drawer;
}

async function closeDrawer(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function publicUrl(page: Page) {
  await page.getByRole("button", { name: "More" }).click();
  const href = await page
    .getByRole("menuitem", { name: "View public roadmap" })
    .getAttribute("href");
  await page.keyboard.press("Escape");
  if (!href) throw new Error("No public link");
  return href;
}

/** A public board card: its title link and vote button live in one article. */
function publicCard(page: Page, title: string) {
  return page.locator("article", { hasText: title });
}

test("admin builds a roadmap: add, drag, set objective, autosave", async ({
  page,
}) => {
  const id = randomUUID().slice(0, 8);
  const { slug } = await signUpOwner(page, id);
  await openRoadmap(page, slug);

  await addCard(page, "Up next", "Dark mode");
  await addCard(page, "Up next", "Bulk export");

  // Drag "Bulk export" from Up next to Future.
  const from = await cardButton(page, "Bulk export").boundingBox();
  const to = await page.getByRole("region", { name: "Future" }).boundingBox();
  if (!from || !to) throw new Error("No layout");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 20, from.y + 20, {
    steps: 5,
  });
  await page.mouse.move(to.x + to.width / 2, to.y + 80, { steps: 15 });
  await page.mouse.up();
  await expect(
    page
      .getByRole("region", { name: "Future" })
      .getByRole("button", { name: "Bulk export", exact: true }),
  ).toBeVisible();

  // Objective + description autosave.
  const drawer = await openCard(page, "Dark mode");
  await drawer.locator("#card-objective").click();
  await page
    .getByRole("listbox", { name: "Objectives" })
    .getByRole("option", { name: "Onboarding" })
    .click();
  await drawer.locator('[contenteditable="true"]').click();
  await page.keyboard.type("Easier on the eyes at night.");
  await expect(drawer.getByText("Saved")).toBeVisible();
  await closeDrawer(page);

  await page.reload();
  await expect(
    page
      .getByRole("region", { name: "Future" })
      .getByRole("button", { name: "Bulk export", exact: true }),
  ).toBeVisible();
  const reopened = await openCard(page, "Dark mode");
  await expect(reopened.locator("#card-objective")).toHaveAccessibleName(
    "Objective: Onboarding",
  );
  await expect(reopened.locator('[contenteditable="true"]')).toContainText(
    "Easier on the eyes at night.",
  );
});

test("objective quick-picker on cards; filters panel narrows the board", async ({
  page,
}) => {
  const id = randomUUID().slice(0, 8);
  const { slug } = await signUpOwner(page, id);
  await openRoadmap(page, slug);
  await addCard(page, "Up next", "Dark mode");
  await addCard(page, "Future", "Bulk export");

  // Pick an existing objective, then create one from the picker.
  const objective = (title: string) =>
    cardButton(page, title)
      .locator("..")
      .getByRole("button", { name: /^Objective:/ });
  const objectives = page.getByRole("listbox", { name: "Objectives" });
  await objective("Dark mode").click();
  await objectives.getByRole("option", { name: "Onboarding" }).click();
  await expect(objectives).toHaveCount(0);
  await expect(objective("Dark mode")).toHaveAccessibleName(
    "Objective: Onboarding",
  );
  await objective("Bulk export").click();
  await page.getByRole("textbox", { name: "Search objectives" }).fill("Speed");
  await page.getByRole("button", { name: "Add “Speed”" }).click();
  await expect(objective("Bulk export")).toHaveAccessibleName(
    "Objective: Speed",
  );

  // Filter by objective, survive a reload (URL), then reset.
  await page.getByRole("button", { name: "Toggle filters" }).click();
  const filters = page.getByRole("complementary", { name: "Filters" });
  await filters.getByRole("radio", { name: "Speed" }).check();
  await expect(cardButton(page, "Dark mode")).toHaveCount(0);
  await expect(cardButton(page, "Bulk export")).toBeVisible();
  await page.reload();
  await expect(cardButton(page, "Bulk export")).toBeVisible();
  await expect(cardButton(page, "Dark mode")).toHaveCount(0);
  await page
    .getByRole("complementary", { name: "Filters" })
    .getByRole("button", { name: "Reset" })
    .click();
  await expect(cardButton(page, "Dark mode")).toBeVisible();
});

test("card drawer rail: duplicate, copy to and move to another column", async ({
  page,
}) => {
  const id = randomUUID().slice(0, 8);
  const { slug } = await signUpOwner(page, id);
  await openRoadmap(page, slug);
  await addCard(page, "Up next", "Dark mode");

  const drawer = await openCard(page, "Dark mode");
  const rail = drawer.getByRole("complementary", { name: "More options" });
  await expect(rail.getByText("Submitted by")).toBeVisible();

  // Duplicate opens the copy.
  await rail.getByRole("button", { name: "Duplicate card" }).click();
  await expect(
    drawer.getByRole("textbox", { name: "Title", exact: true }),
  ).toHaveValue("Dark mode (copy)");

  // Copy to Future: same title, original stays.
  await rail.getByRole("button", { name: "Copy to…" }).click();
  const dialog = page.getByRole("dialog", { name: "Copy card" });
  await dialog.getByRole("combobox", { name: "Column" }).click();
  await page.getByRole("option", { name: "Future" }).click();
  await dialog.getByRole("button", { name: "Copy card" }).click();
  await expect(page.getByText("Card copied.")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await closeDrawer(page);
  // The board sits behind the open drawer (aria-hidden) until it closes.
  await expect(
    page.getByRole("region", { name: "Up next" }).getByRole("button", {
      name: "Dark mode (copy)",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Future" })
      .getByRole("button", { name: "Dark mode (copy)", exact: true }),
  ).toBeVisible();

  // Move the original to Done: it completes.
  const original = await openCard(page, "Dark mode");
  await original
    .getByRole("complementary", { name: "More options" })
    .getByRole("button", { name: "Move to…" })
    .click();
  const move = page.getByRole("dialog", { name: "Move card" });
  await move.getByRole("combobox", { name: "Column" }).click();
  await page.getByRole("option", { name: "Done" }).click();
  await move.getByRole("button", { name: "Move card" }).click();
  await expect(page.getByText("Card moved.")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await closeDrawer(page);
  await expect(
    page
      .getByRole("region", { name: "Done" })
      .getByRole("button", { name: "Dark mode", exact: true }),
  ).toBeVisible();
});

test("card attachments, team comments, follow and CSV export", async ({
  page,
}) => {
  const id = randomUUID().slice(0, 8);
  const { slug } = await signUpOwner(page, id);
  await openRoadmap(page, slug);
  await addCard(page, "Up next", "Dark mode");

  const drawer = await openCard(page, "Dark mode");

  // Attachment: upload a PDF, then delete it.
  await drawer.getByRole("tab", { name: "Attachments (0)" }).click();
  await drawer.getByLabel("Attachment files").setInputFiles({
    name: "spec.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%test\n"),
  });
  await expect(drawer.getByRole("link", { name: "spec.pdf" })).toBeVisible();
  await expect(
    drawer.getByRole("tab", { name: "Attachments (1)" }),
  ).toBeVisible();
  await drawer.getByRole("button", { name: "Delete spec.pdf" }).click();
  await expect(drawer.getByText("No attachments yet.")).toBeVisible();

  // A file that isn't really a PDF is refused by the upload route.
  await drawer.getByLabel("Attachment files").setInputFiles({
    name: "fake.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("<html><script>alert(1)</script>"),
  });
  await expect(page.getByText("fake.pdf: upload failed.")).toBeVisible();

  // Team comment with a link.
  await drawer.getByRole("tab", { name: "Comments (0)" }).click();
  await drawer
    .getByRole("textbox", { name: "New comment" })
    .fill("See https://example.com/spec");
  // Public comments are off, so this is a team note.
  await drawer.getByRole("button", { name: "Add note" }).click();
  await expect(
    drawer.getByRole("link", { name: "https://example.com/spec" }),
  ).toBeVisible();
  await expect(drawer.getByRole("tab", { name: "Comments (1)" })).toBeVisible();

  // Follow sticks after reopening.
  const rail = drawer.getByRole("complementary", { name: "More options" });
  await rail.getByRole("button", { name: "Follow" }).click();
  await expect(rail.getByRole("button", { name: "Unfollow" })).toBeVisible();
  await closeDrawer(page);
  const again = await openCard(page, "Dark mode");
  await expect(
    again
      .getByRole("complementary", { name: "More options" })
      .getByRole("button", { name: "Unfollow" }),
  ).toBeVisible();
  await expect(again.getByRole("tab", { name: "Comments (1)" })).toBeVisible();
  await closeDrawer(page);

  // Filters see the new data.
  await page.getByRole("button", { name: "Toggle filters" }).click();
  const filters = page.getByRole("complementary", { name: "Filters" });
  await filters.getByText("Comments", { exact: true }).click();
  await filters.getByRole("radio", { name: "No comments" }).check();
  await expect(cardButton(page, "Dark mode")).toHaveCount(0);
  await filters.getByRole("button", { name: "Reset" }).click();

  // Export CSV downloads the roadmap.
  await page.getByRole("button", { name: "More" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Export CSV" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.csv$/);
  const path = await file.path();
  const { readFile } = await import("node:fs/promises");
  expect(await readFile(path, "utf8")).toContain("Dark mode");
});

test("public site header tabs follow the Public site switches", async ({
  page,
}) => {
  const id = randomUUID().slice(0, 8);
  const { slug } = await signUpOwner(page, id);
  await openRoadmap(page, slug);
  const href = await publicUrl(page);

  await page.goto(href);
  const site = page.getByRole("navigation", { name: "Site" });
  await expect(site.getByRole("link", { name: "Roadmap" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();

  // Switching the Roadmap off makes the public page a real 404.
  await page.goto(`/dashboard/${slug}/public-settings`);
  await page.getByRole("switch", { name: "Roadmap" }).click();
  const save = page.getByRole("button", { name: "Save changes" });
  const status = () => page.request.get(href).then((r) => r.status());
  await save.click();
  await expect.poll(status).toBe(404);

  await page.getByRole("switch", { name: "Roadmap" }).click();
  await save.click();
  await expect.poll(status).toBe(200);
});

test("public site shows only public cards; drawer, card page and search work", async ({
  page,
  browser,
}) => {
  const id = randomUUID().slice(0, 8);
  const { slug } = await signUpOwner(page, id);
  await openRoadmap(page, slug);
  await addCard(page, "Up next", "Public idea");
  await addCard(page, "Up next", "Secret idea");

  const drawer = await openCard(page, "Secret idea");
  await drawer.getByRole("combobox", { name: "Public visibility" }).click();
  await page.getByRole("option", { name: "Private (team only)" }).click();
  await expect(drawer.getByText("Saved")).toBeVisible();
  await closeDrawer(page);
  const url = await publicUrl(page);

  const guest = await visitor(browser);
  await guest.goto(url);
  await expect(guest.getByRole("region", { name: "Up next" })).toBeVisible();
  await expect(publicCard(guest, "Public idea")).toBeVisible();
  await expect(publicCard(guest, "Secret idea")).toHaveCount(0);

  // A click opens the drawer and updates the URL; Back closes it.
  await publicCard(guest, "Public idea").click();
  await expect(
    guest
      .getByRole("dialog")
      .getByRole("heading", { level: 1, name: "Public idea" }),
  ).toBeVisible();
  await expect(guest).toHaveURL(/\/roadmap\/public-idea$/);
  const details = guest.getByRole("dialog").getByRole("tabpanel");
  await expect(details.getByText("Status")).toBeVisible();
  await expect(details.getByText("Untagged")).toBeVisible();
  await guest.goBack();
  await expect(guest.getByRole("dialog")).toHaveCount(0);

  // The card page is server-rendered on its own.
  await guest.goto(`${url}/public-idea`);
  await expect(
    guest.getByRole("heading", { level: 1, name: "Public idea" }),
  ).toBeVisible();

  // The private card's page is a real 404 (checked in the proxy).
  const hidden = await guest.goto(`${url}/secret-idea`);
  expect(hidden?.status()).toBe(404);

  // Search.
  await guest.goto(url);
  await guest
    .getByRole("searchbox", { name: "Search the roadmap" })
    .fill("public");
  await guest.keyboard.press("Enter");
  await expect(guest).toHaveURL(/\?q=public/);
  await expect(publicCard(guest, "Public idea")).toBeVisible();
});

test("anonymous visitors vote, unvote, and count separately", async ({
  page,
  browser,
}) => {
  const id = randomUUID().slice(0, 8);
  const { slug } = await signUpOwner(page, id);
  await openRoadmap(page, slug);
  await addCard(page, "Up next", "Vote me");
  const url = await publicUrl(page);

  const first = await visitor(browser);
  await first.goto(url);
  const card = publicCard(first, "Vote me");
  await card.getByRole("button", { name: "Vote for this" }).click();
  await expect(card.getByRole("button", { pressed: true })).toBeVisible();
  await expect(first.getByText("Vote added")).toBeVisible();
  await expect(card.getByTestId("vote-count")).toHaveText("1");

  // The vote survives a reload (fresh server render + visitor cookie).
  await first.reload();
  await expect(card.getByTestId("vote-count")).toHaveText("1");
  await expect(card.getByRole("button", { pressed: true })).toBeVisible();

  // Clicking again removes it.
  await card.getByRole("button", { name: "Remove your vote" }).click();
  await expect(card.getByTestId("vote-count")).toHaveText("0");

  // Two different visitors → two votes.
  await card.getByRole("button", { name: "Vote for this" }).click();
  await expect(card.getByTestId("vote-count")).toHaveText("1");
  const second = await visitor(browser);
  await second.goto(url);
  const again = publicCard(second, "Vote me");
  await expect(again.getByRole("button", { pressed: false })).toBeVisible();
  await again.getByRole("button", { name: "Vote for this" }).click();
  await expect(again.getByTestId("vote-count")).toHaveText("2");
});

test("require sign-in: voter signs in with an email code and is listed by name", async ({
  page,
  browser,
}) => {
  const id = randomUUID().slice(0, 8);
  const { slug } = await signUpOwner(page, id);

  await page.goto(`/dashboard/${slug}/settings/workspace`);
  await page
    .getByRole("switch", { name: "Require sign-in to vote, comment or submit" })
    .click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Workspace saved.")).toBeVisible();

  await openRoadmap(page, slug);
  await addCard(page, "Up next", "Members only");
  const url = await publicUrl(page);

  const voter = await visitor(browser);
  await voter.goto(url);
  const card = publicCard(voter, "Members only");
  await card.getByRole("button", { name: "Vote for this" }).click();

  const dialog = voter.getByRole("dialog", { name: "Log in" });
  await expect(dialog).toBeVisible();
  const email = `voter-${id}@example.test`;
  await dialog.getByRole("textbox", { name: "Email" }).fill(email);
  await dialog.getByRole("button", { name: "Email me a code" }).click();
  const mail = await waitForMail(email, "sign-in code");
  const code = mail.subject.match(/\d{6}/)?.[0];
  if (!code) throw new Error("No code in email");
  await dialog.getByRole("textbox", { name: "Code" }).fill(code);
  await dialog.getByRole("button", { name: "Log in" }).click();
  await expect(dialog).toHaveCount(0);

  await card.getByRole("button", { name: "Vote for this" }).click();
  await expect(card.getByTestId("vote-count")).toHaveText("1");

  // The admin sees the voter in the card's Votes tab.
  await page.reload();
  const drawer = await openCard(page, "Members only");
  await drawer.getByRole("tab", { name: /Votes \(1\)/ }).click();
  await expect(drawer.getByText(email).first()).toBeVisible();
});

test("embed.js inserts a self-sizing iframe where voting works", async ({
  page,
  browser,
}) => {
  const id = randomUUID().slice(0, 8);
  const { slug } = await signUpOwner(page, id);
  await openRoadmap(page, slug);
  await addCard(page, "Up next", "Embedded idea");
  const url = new URL(await publicUrl(page));
  const { origin } = url;
  const account = url.pathname.split("/")[1];

  // A customer page that only has the snippet, served by a real local
  // server on 127.0.0.1 (another site than localhost). A route-mocked page
  // would count as public, and Chrome blocks public pages from loading
  // loopback URLs.
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html><title>Customer</title><h1>Our roadmap</h1>
      <script src="${origin}/embed.js" data-account="${account}" data-workspace="${slug}" async></script>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const host = await visitor(browser);
  await host.goto(`http://127.0.0.1:${port}/`);
  const iframe = host.locator('iframe[title="Roadmap"]');
  await expect(iframe).toBeVisible();

  const frame = host.frameLocator('iframe[title="Roadmap"]');
  const card = frame.locator("article", { hasText: "Embedded idea" });
  await expect(card).toBeVisible();

  // The iframe grows from its 600px default to fit the board.
  await expect
    .poll(async () => (await iframe.boundingBox())?.height ?? 0)
    .not.toBe(600);

  await card.getByRole("button", { name: "Vote for this" }).click();
  await expect(card.getByTestId("vote-count")).toHaveText("1");
  server.close();
});
