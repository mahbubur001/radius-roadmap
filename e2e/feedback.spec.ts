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
  // Owners get the board switcher (with "New board") instead of a heading.
  await expect(page.getByRole("combobox", { name: "Board" })).toHaveText(
    "Feature requests",
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
  await page.getByRole("button", { name: "Statuses" }).click();
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
  await page.getByRole("combobox", { name: "Board" }).click();
  await page.getByRole("option", { name: "New board" }).click();
  const settings = page.getByRole("dialog");
  await expect(
    settings.getByRole("heading", { name: "Edit board" }),
  ).toBeVisible();
  await settings.getByRole("textbox", { name: "Name" }).fill("Bug reports");
  await settings.getByRole("textbox", { name: "URL" }).fill("bugs");
  await settings.getByRole("button", { name: "Save board" }).click();
  await expect(page).toHaveURL(/\?b=bugs$/);
  await expect(page.getByRole("combobox", { name: "Board" })).toHaveText(
    "Bug reports",
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
