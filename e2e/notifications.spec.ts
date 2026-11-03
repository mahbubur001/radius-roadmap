import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signUpOwner } from "./helpers";

// Settings > Notifications (doc 33): every alert, its options, saved per member.

test("notification settings: seven alerts, own options, saved", async ({
  page,
}) => {
  const { slug } = await signUpOwner(page, randomUUID().slice(0, 8));
  await page.goto(`/dashboard/${slug}/settings/notifications`);

  for (const name of [
    "New ideas",
    "Ideas waiting for review",
    "Votes",
    "New comments",
    "Replies to you",
    "New subscribers",
    "Weekly summary",
  ]) {
    await expect(page.getByRole("combobox", { name })).toBeVisible();
  }
  // Owner defaults (doc 33 §2).
  await expect(page.getByRole("combobox", { name: "Votes" })).toHaveText(
    "Right away",
  );
  await expect(
    page.getByRole("combobox", { name: "Ideas waiting for review" }),
  ).toHaveText("Daily digest");
  await expect(
    page.getByRole("combobox", { name: "Weekly summary" }),
  ).toHaveText("On");

  // The review reminder has no "Right away".
  await page
    .getByRole("combobox", { name: "Ideas waiting for review" })
    .click();
  await expect(page.getByRole("option", { name: "Right away" })).toHaveCount(0);
  await page.getByRole("option", { name: "Weekly digest" }).click();

  await page.getByRole("combobox", { name: "Votes" }).click();
  await page.getByRole("option", { name: "Daily digest" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Notifications saved.")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("combobox", { name: "Votes" })).toHaveText(
    "Daily digest",
  );
  await expect(
    page.getByRole("combobox", { name: "Ideas waiting for review" }),
  ).toHaveText("Weekly digest");
});
