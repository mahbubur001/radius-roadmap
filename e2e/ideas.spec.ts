import { randomUUID } from "node:crypto";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { signUpOwner } from "./helpers";

// Public Ideas (doc 20 steps 5–8, doc 22 step 4).

test.use({ actionTimeout: 10_000 });

async function visitor(browser: Browser) {
  const rand = () => Math.floor(Math.random() * 254) + 1;
  const context = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": `10.${rand()}.${rand()}.${rand()}` },
  });
  return context.newPage();
}

/** The public Ideas URL, from the roadmap's "View public roadmap" link. */
async function ideasUrl(page: Page, slug: string) {
  await page.goto(`/dashboard/${slug}/roadmap`);
  await page.getByRole("button", { name: "More" }).click();
  const href = await page
    .getByRole("menuitem", { name: "View public roadmap" })
    .getAttribute("href");
  await page.keyboard.press("Escape");
  if (!href) throw new Error("No public link");
  return href.replace(/\/roadmap$/, "/ideas");
}

test("a guest submits an idea, the team approves it, a visitor votes", async ({
  page,
  browser,
}) => {
  const id = randomUUID().slice(0, 8);
  const { slug } = await signUpOwner(page, id);
  const url = await ideasUrl(page, slug);

  // A guest fills in LoopedIn's side form.
  const guest = await visitor(browser);
  await guest.goto(url);
  const site = guest.getByRole("navigation", { name: "Site" });
  await expect(site.getByRole("link", { name: "Ideas" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const form = guest.getByRole("form", { name: "Add new idea" });
  await form.getByRole("button", { name: "Submit idea" }).click();
  await expect(form.getByText("At least 3 characters")).toBeVisible();
  await form.getByLabel("Title").fill("Dark mode please");
  await form.getByLabel("More details").fill("Easier on the eyes.");
  await form.getByLabel("Name").fill("Guest Gina");
  await form.getByLabel("Email address").fill(`gina-${id}@example.test`);
  await form.getByRole("button", { name: "Submit idea" }).click();
  await expect(
    guest.getByText("Thanks! The team will review your idea."),
  ).toBeVisible();
  const mine = guest.getByRole("list", { name: "Your ideas" });
  await expect(mine.getByText("Dark mode please")).toBeVisible();
  await expect(mine.getByText("Waiting for review")).toBeVisible();
  // Now logged in as the guest: the form stops asking for a name.
  await expect(form.getByText("Posting as")).toBeVisible();

  // The team approves it from the inbox.
  await page.goto(`/dashboard/${slug}/feedback/inbox`);
  await page.getByRole("checkbox", { name: "Select Dark mode please" }).click();
  await page
    .getByRole("toolbar", { name: "Bulk actions" })
    .getByRole("button", { name: "Approve" })
    .click();
  await expect(page.getByText("Approve: 1 item.")).toBeVisible();

  // Anyone now sees it and can vote; its own page works too.
  const anon = await visitor(browser);
  await anon.goto(url);
  const idea = anon.locator("article", { hasText: "Dark mode please" });
  await expect(idea).toBeVisible();
  await idea.getByRole("button", { name: "Vote for this" }).click();
  await expect(idea.getByTestId("vote-count")).toHaveText("1");
  await expect(anon.getByText("Vote added")).toBeVisible();

  await idea.getByRole("link", { name: "Dark mode please" }).click();
  const drawer = anon.getByRole("dialog");
  await expect(
    drawer.getByRole("heading", { level: 1, name: "Dark mode please" }),
  ).toBeVisible();
  await expect(drawer.getByText("Easier on the eyes.")).toBeVisible();
  await expect(anon).toHaveURL(/\/ideas\/dark-mode-please$/);
  await anon.reload();
  await expect(
    anon.getByRole("heading", { level: 1, name: "Dark mode please" }),
  ).toBeVisible();
});

test("ideas 404 when switched off; merged ideas redirect", async ({ page }) => {
  const id = randomUUID().slice(0, 8);
  const { slug } = await signUpOwner(page, id);
  const url = await ideasUrl(page, slug);

  // Two items, one merged into the other (same steps as feedback.spec.ts).
  await page.goto(`/dashboard/${slug}/feedback`);
  for (const title of ["Keep me", "Merge me"]) {
    await page.getByRole("button", { name: "New feedback" }).click();
    await page
      .getByRole("dialog")
      .getByRole("textbox", { name: "Title" })
      .fill(title);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Create" })
      .click();
    const drawer = page.getByRole("dialog", { name: "Edit feedback" });
    await expect(
      drawer.getByRole("textbox", { name: "Title", exact: true }),
    ).toHaveValue(title);
    if (title === "Keep me") {
      await drawer.getByRole("button", { name: "Close" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
  }
  await page
    .getByRole("dialog", { name: "Edit feedback" })
    .getByRole("button", { name: "Feedback actions" })
    .click();
  await page.getByRole("menuitem", { name: "Merge into…" }).click();
  const merge = page.getByRole("dialog", { name: "Merge into…" });
  await merge.getByRole("searchbox", { name: "Search feedback" }).fill("Keep");
  await merge.getByRole("button", { name: /Keep me/ }).click();
  await merge.getByRole("button", { name: "Merge" }).click();
  await expect(
    page.getByText("Merged. Votes and followers moved over."),
  ).toBeVisible();

  const res = await page.request.get(`${url}/merge-me`, { maxRedirects: 0 });
  expect(res.status()).toBe(308);
  expect(res.headers().location).toMatch(/\/ideas\/keep-me$/);

  // Switching Ideas off hides the page.
  await page.goto(`/dashboard/${slug}/public-settings`);
  await page.getByRole("switch", { name: "Ideas" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect
    .poll(() => page.request.get(url).then((r) => r.status()))
    .toBe(404);
});

test("with comments on: a visitor comments, the team approves, replies and leaves an internal note", async ({
  page,
  browser,
}) => {
  const id = randomUUID().slice(0, 8);
  const { slug } = await signUpOwner(page, id);
  const url = await ideasUrl(page, slug);

  // Comments + approval + follows on; one idea.
  await page.goto(`/dashboard/${slug}/public-settings`);
  for (const name of ["Comments", "Approve comments first", "Follows"]) {
    await page.getByRole("switch", { name, exact: true }).click();
  }
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Public site saved.")).toBeVisible();
  await page.goto(`/dashboard/${slug}/feedback`);
  await page.getByRole("button", { name: "New feedback" }).click();
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Title" })
    .fill("Webhooks");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create" })
    .click();
  await expect(
    page
      .getByRole("dialog", { name: "Edit feedback" })
      .getByRole("textbox", { name: "Title", exact: true }),
  ).toHaveValue("Webhooks");

  // A visitor logs in as a guest, follows and comments: held for approval.
  const guest = await visitor(browser);
  await guest.goto(`${url}/webhooks`);
  await guest.getByRole("button", { name: "Follow" }).click();
  const login = guest.getByRole("dialog", { name: "Log in" });
  await login.getByRole("tab", { name: "Guest" }).click();
  await login.getByRole("textbox", { name: "Name" }).fill("Vera");
  await login
    .getByRole("textbox", { name: "Email" })
    .fill(`vera-${id}@example.test`);
  await login.getByRole("button", { name: "Continue as guest" }).click();
  await expect(login).toHaveCount(0);
  await guest.getByRole("button", { name: "Follow" }).click();
  await expect(guest.getByRole("button", { name: "Following" })).toBeVisible();
  await guest.getByRole("tab", { name: /Comments/ }).click();
  await guest
    .getByRole("textbox", { name: "Write a comment" })
    .fill("Please add retries, see https://example.com/retries");
  await guest.getByRole("button", { name: "Post comment" }).click();
  await expect(
    guest.getByText("Your comment will show once the team approves it."),
  ).toBeVisible();

  // The team approves it from Feedback → Comments.
  await page.goto(`/dashboard/${slug}/feedback/comments`);
  const queue = page.getByRole("list", { name: "Comments to approve" });
  await expect(queue.getByText("Please add retries")).toBeVisible();
  await queue.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Comment approved.")).toBeVisible();

  // In the drawer: a public reply and an internal note.
  await page.goto(`/dashboard/${slug}/feedback`);
  await page.getByRole("button", { name: "Webhooks" }).click();
  const drawer = page.getByRole("dialog", { name: "Edit feedback" });
  await drawer.getByRole("tab", { name: /Comments/ }).click();
  await drawer.getByRole("textbox", { name: "New comment" }).fill("On it!");
  await drawer.getByRole("button", { name: "Reply" }).click();
  await expect(drawer.getByText("On it!")).toBeVisible();
  await drawer.getByRole("switch", { name: "Internal note" }).click();
  await drawer
    .getByRole("textbox", { name: "New comment" })
    .fill("Needs a queue first");
  await drawer.getByRole("button", { name: "Add note" }).click();
  await expect(drawer.getByText("Needs a queue first")).toBeVisible();

  // The public page shows the comment and the team reply, not the note.
  await guest.goto(`${url}/webhooks`);
  await guest.getByRole("tab", { name: "Comments (2)" }).click();
  const thread = guest.getByRole("list", { name: "Comments" });
  await expect(
    thread.getByRole("link", { name: "https://example.com/retries" }),
  ).toBeVisible();
  await expect(thread.getByText("On it!")).toBeVisible();
  await expect(thread.getByText("Team")).toBeVisible();
  await expect(guest.getByText("Needs a queue first")).toHaveCount(0);
  await expect(guest.getByRole("button", { name: "Following" })).toBeVisible();
});
