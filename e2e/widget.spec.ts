import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signUpOwner } from "./helpers";

// The JavaScript widget on a customer's page (doc 26 6B). Needs a fresh
// widget build: `pnpm build:widget` (the CI build runs it).

test("widget on a customer page: unread badge, post, reaction, feedback to the inbox", async ({
  page,
  browser,
}) => {
  const id = randomUUID().slice(0, 8);
  const { slug } = await signUpOwner(page, id);
  const site = `e2e-co-${id}`;

  // A published post for the widget to show.
  await page.goto(`/dashboard/${slug}/updates`);
  await page.getByRole("button", { name: "New post" }).click();
  await expect(page).toHaveURL(/\/updates\/[0-9a-f-]{36}$/);
  await page.getByRole("textbox", { name: "Title" }).fill("Widget news");
  await page.locator('[contenteditable="true"]').click();
  await page.keyboard.type("Shown inside the widget.");
  const publishing = page.getByRole("region", { name: "Publishing" });
  await publishing.getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByText("Published.")).toBeVisible();

  // The install snippet names the site.
  await page.goto(`/dashboard/${slug}/widget`);
  await expect(page.getByText(`site: "${site}"`).first()).toBeVisible();

  // A visitor on the customer's site.
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`/widget-test.html?site=${site}`);
  const launcher = visitor.getByRole("button", { name: "What's new (1 new)" });
  await expect(launcher).toBeVisible();
  await launcher.click();
  const panel = visitor.getByRole("dialog", { name: "What's new" });
  await panel.getByRole("button", { name: "Widget news" }).click();
  await expect(panel.getByText("Shown inside the widget.")).toBeVisible();
  await panel.getByRole("button", { name: /Celebrate/ }).click();
  await expect(
    panel.getByRole("button", { name: "Celebrate (1)" }),
  ).toHaveAttribute("aria-pressed", "true");

  // Seen: the badge is gone after closing and reloading.
  await panel.getByRole("button", { name: "Close" }).click();
  await visitor.reload();
  await expect(
    visitor.getByRole("button", { name: "What's new", exact: true }),
  ).toBeVisible();

  // Feedback from an unidentified visitor waits in the triage inbox.
  await visitor
    .getByRole("button", { name: "What's new", exact: true })
    .click();
  await panel.getByRole("button", { name: "Send feedback" }).click();
  await panel
    .getByRole("textbox", { name: "What would you like?" })
    .fill("Export to CSV");
  await panel.getByRole("textbox", { name: "Your name" }).fill("Wanda");
  await panel
    .getByRole("textbox", { name: "Your email" })
    .fill(`wanda-${id}@example.test`);
  await panel.getByRole("button", { name: "Send feedback" }).click();
  await expect(panel.getByText("Thanks for the feedback!")).toBeVisible();
  await visitor.close();

  await page.goto(`/dashboard/${slug}/feedback/inbox`);
  await expect(page.getByText("Export to CSV")).toBeVisible();
});
