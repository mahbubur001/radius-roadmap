import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { signUpOwner } from "./helpers";

// Phase 3 admin flows (doc 20 §6). Public submissions (and so the inbox
// review flow) are covered once the public feedback page exists (step 6).

async function addFeedback(page: Page, title: string) {
  await page.getByRole("button", { name: "New feedback" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Title" }).fill(title);
  await dialog.getByRole("button", { name: "Create" }).click();
  // Creating opens the drawer; close it to get back to the list.
  const drawer = page.getByRole("dialog", { name: "Edit feedback" });
  await expect(
    drawer.getByRole("textbox", { name: "Title", exact: true }),
  ).toHaveValue(title);
  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: title })).toBeVisible();
}

test("bulk status change, statuses editor, and a second board", async ({
  page,
}) => {
  const id = randomUUID().slice(0, 8);
  const { slug } = await signUpOwner(page, id);
  await page.goto(`/dashboard/${slug}/feedback`);
  // Each board is a tab with its open-item count.
  const boards = page.getByRole("navigation", { name: "Boards" });
  await expect(boards.locator("[aria-current=page]")).toHaveText(
    "Feature requests (0)",
  );

  await addFeedback(page, "Export to CSV");
  await addFeedback(page, "Dark mode");

  // Select both and mark them Done: they leave the "open" list.
  await page.getByRole("checkbox", { name: "Select all" }).click();
  const bar = page.getByRole("toolbar", { name: "Bulk actions" });
  await expect(bar.getByText("2 selected")).toBeVisible();
  await bar.getByRole("combobox", { name: "Set status" }).click();
  await page.getByRole("option", { name: "Done" }).click();
  await expect(page.getByText("Updated 2 items.")).toBeVisible();
  await expect(
    page.getByText("No feedback matches these filters."),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Export to CSV" })).toHaveCount(
    0,
  );
  await page.goto(`/dashboard/${slug}/feedback?state=completed`);
  await expect(
    page.getByRole("button", { name: "Export to CSV" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Dark mode" })).toBeVisible();

  // Statuses editor: add one and it shows up in the status filter.
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Statuses" }).click();
  const statuses = page.getByRole("dialog");
  await statuses
    .getByRole("textbox", { name: "New status" })
    .fill("Needs info");
  await statuses.getByRole("button", { name: "Add" }).click();
  await expect(
    statuses.getByRole("button", { name: "Delete status Needs info" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("combobox", { name: "Filter by status" }).click();
  await expect(page.getByRole("option", { name: "Needs info" })).toBeVisible();
  await page.keyboard.press("Escape");

  // A second board, renamed in its settings.
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "New board" }).click();
  const settings = page.getByRole("dialog");
  await expect(
    settings.getByRole("heading", { name: "Edit board" }),
  ).toBeVisible();
  await settings.getByRole("textbox", { name: "Name" }).fill("Bug reports");
  await settings.getByRole("textbox", { name: "URL" }).fill("bugs");
  await settings.getByRole("button", { name: "Save board" }).click();
  await expect(page).toHaveURL(/\?b=bugs$/);
  await expect(boards.locator("[aria-current=page]")).toHaveText(
    "Bug reports (0)",
  );
  await expect(page.getByText("No feedback yet.")).toBeVisible();
});

test("the inbox starts empty and the sidebar has no badge", async ({
  page,
}) => {
  const { slug } = await signUpOwner(page, randomUUID().slice(0, 8));
  await page.goto(`/dashboard/${slug}/feedback/inbox`);
  await expect(page.getByText("You're all caught up.")).toBeVisible();
  await expect(page.getByTestId("inbox-badge")).toHaveCount(0);
});

async function openFeedback(page: Page, title: string) {
  await page.getByRole("button", { name: title }).click();
  const drawer = page.getByRole("dialog", { name: "Edit feedback" });
  await expect(
    drawer.getByRole("textbox", { name: "Title", exact: true }),
  ).toHaveValue(title);
  return drawer;
}

async function drawerAction(page: Page, name: string) {
  await page
    .getByRole("dialog", { name: "Edit feedback" })
    .getByRole("button", { name: "Feedback actions" })
    .click();
  await page.getByRole("menuitem", { name }).click();
}

test("push to roadmap, 💡 on the card, card completion syncs, merge", async ({
  page,
}) => {
  const { slug } = await signUpOwner(page, randomUUID().slice(0, 8));
  await page.goto(`/dashboard/${slug}/feedback`);
  await addFeedback(page, "Webhooks");

  // Push to roadmap: the feedback is linked and moves to Planned.
  let drawer = await openFeedback(page, "Webhooks");
  await drawerAction(page, "Push to roadmap…");
  const push = page.getByRole("dialog", { name: "Push to roadmap" });
  await expect(push.getByRole("combobox", { name: "Column" })).toHaveText(
    "In progress",
  );
  await push.getByRole("button", { name: "Create card" }).click();
  await expect(page.getByText("Card created on the roadmap.")).toBeVisible();
  drawer = page.getByRole("dialog", { name: "Edit feedback" });
  const linked = drawer.getByRole("region", { name: "On the roadmap" });
  await expect(linked.getByRole("link", { name: "Webhooks" })).toBeVisible();
  await expect(drawer.getByRole("combobox", { name: "Status" })).toHaveText(
    "Planned",
  );
  await drawer.getByRole("button", { name: "Close" }).click();

  // The card shows the 💡 count on the board and the public roadmap.
  await page.goto(`/dashboard/${slug}/roadmap`);
  const card = page.getByRole("button", { name: "Webhooks", exact: true });
  await expect(card).toBeVisible();
  await expect(page.getByTitle("1 linked feedback")).toBeVisible();
  await page.getByRole("button", { name: "More" }).click();
  const publicHref = await page
    .getByRole("menuitem", { name: "View public roadmap" })
    .getAttribute("href");
  await page.keyboard.press("Escape");
  await card.click();
  const cardDrawer = page.getByRole("dialog");
  await cardDrawer.getByRole("tab", { name: "Linked feedback (1)" }).click();
  await expect(
    cardDrawer.getByRole("link", { name: "Webhooks" }),
  ).toBeVisible();

  // Completing the card completes the linked feedback (doc 20 D5).
  await cardDrawer.getByRole("button", { name: "Mark as complete" }).click();
  await expect(cardDrawer.getByText("Completed")).toBeVisible();
  await page.goto(`/dashboard/${slug}/feedback?state=completed`);
  await expect(page.getByRole("button", { name: "Webhooks" })).toBeVisible();

  const visitor = await page.context().browser()?.newPage();
  if (visitor && publicHref) {
    await visitor.goto(publicHref);
    await expect(visitor.getByText("1 request")).toBeVisible();
    await visitor.close();
  }

  // Merge one item into another: the source leaves the list.
  await page.goto(`/dashboard/${slug}/feedback`);
  await addFeedback(page, "Dup one");
  await addFeedback(page, "Dup two");
  await openFeedback(page, "Dup one");
  await drawerAction(page, "Merge into…");
  const merge = page.getByRole("dialog", { name: "Merge into…" });
  await merge
    .getByRole("searchbox", { name: "Search feedback" })
    .fill("Dup two");
  await merge.getByRole("button", { name: /Dup two/ }).click();
  await merge.getByRole("button", { name: "Merge" }).click();
  await expect(
    page.getByText("Merged. Votes and followers moved over."),
  ).toBeVisible();
  await expect(
    page
      .getByRole("dialog", { name: "Edit feedback" })
      .getByRole("textbox", { name: "Title", exact: true }),
  ).toHaveValue("Dup two");
  // Load the list without ?feedback= (the drawer would hide the rows).
  await page.goto(`/dashboard/${slug}/feedback`);
  await expect(page.getByRole("button", { name: "Dup two" })).toBeVisible();
});
