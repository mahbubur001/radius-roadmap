import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signUpOwner } from "./helpers";

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
