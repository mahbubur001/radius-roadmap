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

  // Anyone can react; the reaction survives a reload.
  const reactions = page.getByRole("group", { name: "Reactions" });
  await reactions.getByRole("button", { name: /Celebrate/ }).click();
  await expect(
    reactions.getByRole("button", { name: "Celebrate (1)" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(
    page
      .getByRole("group", { name: "Reactions" })
      .getByRole("button", { name: "Celebrate (1)" }),
  ).toHaveAttribute("aria-pressed", "true");
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

  // Publishing the next post emails it, with a one-click unsubscribe link.
  await page.goto(`/dashboard/${slug}/updates`);
  await page.getByRole("button", { name: "New post" }).click();
  await expect(page).toHaveURL(/\/updates\/[0-9a-f-]{36}$/);
  await page.getByRole("textbox", { name: "Title" }).fill("Second news");
  await page.locator('[contenteditable="true"]').click();
  await page.keyboard.type("Fresh features inside.");
  await expect(page.getByText(/^Saved ·/)).toBeVisible();
  await page
    .getByRole("region", { name: "Publishing" })
    .getByRole("button", { name: "Publish now" })
    .click();
  const post = await waitForMail(email, "Second news");
  expect(post.text).toContain("Fresh features inside.");
  const unsubscribeUrl = post.html.match(
    /href="([^"]*\/api\/public\/unsubscribe[^"]*)"/,
  )?.[1];
  if (!unsubscribeUrl) throw new Error("No unsubscribe link");
  const link = unsubscribeUrl.replaceAll("&amp;", "&");

  // Opening the link (as a mail scanner would) changes nothing...
  await visitor.goto(link);
  await expect(
    visitor.getByRole("heading", { name: /Unsubscribe from/ }),
  ).toBeVisible();
  await page.goto(`/dashboard/${slug}/updates/subscribers`);
  await expect(
    page.getByRole("row", { name: new RegExp(email) }),
  ).toContainText("Active");
  // ...the button does.
  await visitor.getByRole("button", { name: "Unsubscribe" }).click();
  await expect(
    visitor.getByRole("heading", { name: "You're unsubscribed" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("row", { name: new RegExp(email) }),
  ).toContainText("Unsubscribed");

  // RFC 8058 one-click (what Gmail's own "Unsubscribe" button sends).
  const oneClick = await page.request.post(link, {
    form: { "List-Unsubscribe": "One-Click" },
  });
  expect(oneClick.status()).toBe(200);
});

test("a follower hears when the idea ships, and can stop following", async ({
  page,
  browser,
}) => {
  const id = randomUUID().slice(0, 8);
  const { slug } = await signUpOwner(page, id);

  // Follows on; an idea pushed to the roadmap.
  await page.goto(`/dashboard/${slug}/public-settings`);
  await page.getByRole("switch", { name: "Follows", exact: true }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Public site saved.")).toBeVisible();
  await page.goto(`/dashboard/${slug}/feedback`);
  await page.getByRole("button", { name: "New feedback" }).click();
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Title" })
    .fill("Dark mode");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create" })
    .click();
  const drawer = page.getByRole("dialog", { name: "Edit feedback" });
  await expect(
    drawer.getByRole("textbox", { name: "Title", exact: true }),
  ).toHaveValue("Dark mode");
  await drawer.getByRole("button", { name: "Feedback actions" }).click();
  await page.getByRole("menuitem", { name: "Push to roadmap…" }).click();
  await page
    .getByRole("dialog", { name: "Push to roadmap" })
    .getByRole("button", { name: "Create card" })
    .click();
  await expect(page.getByText("Card created on the roadmap.")).toBeVisible();

  // A voter logs in with an email code (verified) and follows the idea.
  await page.goto(`/dashboard/${slug}/roadmap`);
  await page.getByRole("button", { name: "More" }).click();
  const roadmapUrl = await page
    .getByRole("menuitem", { name: "View public roadmap" })
    .getAttribute("href");
  await page.keyboard.press("Escape");
  if (!roadmapUrl) throw new Error("No public link");
  const voter = await (await browser.newContext()).newPage();
  await voter.goto(roadmapUrl.replace(/\/roadmap$/, "/ideas/dark-mode"));
  await voter.getByRole("button", { name: "Follow" }).click();
  const login = voter.getByRole("dialog", { name: "Log in" });
  const email = `fan-${id}@example.test`;
  await login.getByRole("textbox", { name: "Email" }).fill(email);
  await login.getByRole("button", { name: "Email me a code" }).click();
  const code = (await waitForMail(email, "sign-in code")).subject.slice(0, 6);
  await login.getByRole("textbox", { name: "Code" }).fill(code);
  await login.getByRole("button", { name: "Log in" }).click();
  await expect(login).toHaveCount(0);
  await voter.getByRole("button", { name: "Follow" }).click();
  await expect(voter.getByRole("button", { name: "Following" })).toBeVisible();

  // The team completes the card and announces it.
  await page.getByRole("button", { name: "Dark mode", exact: true }).click();
  const rail = page
    .getByRole("dialog")
    .getByRole("complementary", { name: "More options" });
  await rail.getByRole("button", { name: "Mark as complete" }).click();
  await rail.getByRole("button", { name: "Announce…" }).click();
  await expect(page).toHaveURL(/\/updates\/[0-9a-f-]{36}$/);
  await page.getByRole("textbox", { name: "Title" }).fill("Dark mode is here");
  await expect(page.getByText(/^Saved ·/)).toBeVisible();
  await page
    .getByRole("region", { name: "Publishing" })
    .getByRole("button", { name: "Publish now" })
    .click();

  const shipped = await waitForMail(email, "Shipped: Dark mode");
  expect(shipped.text).toContain("Dark mode is here");
  const unfollow = shipped.html
    .match(/href="([^"]*\/api\/public\/unfollow[^"]*)"/)?.[1]
    ?.replaceAll("&amp;", "&");
  if (!unfollow) throw new Error("No unfollow link");
  await voter.goto(unfollow);
  await voter.getByRole("button", { name: "Stop following" }).click();
  await expect(
    voter.getByRole("heading", { name: /stopped following “Dark mode”/ }),
  ).toBeVisible();
});
