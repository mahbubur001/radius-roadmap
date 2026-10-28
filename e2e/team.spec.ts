import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signUpAndVerify, signUpOwner } from "./helpers";
import { firstLink, waitForMail } from "./mail";

test("invite a member to one workspace; they see only that workspace", async ({
  page,
  browser,
}) => {
  const id = randomUUID().slice(0, 8);
  const { slug: first } = await signUpOwner(page, id);

  // Owner creates a second workspace from the switcher.
  const second = `second-${id}`;
  await page.getByRole("button", { name: "Switch workspace" }).click();
  await page.getByRole("menuitem", { name: "New workspace" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Product or project name")
    .fill(`Second ${id}`);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create workspace" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/${second}$`));

  // Invite a member with access to the first workspace only.
  const mateEmail = `mate-${id}@example.test`;
  await page.goto(`/dashboard/${first}/settings/team`);
  await page.getByRole("button", { name: "Invite teammate" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email").fill(mateEmail);
  await dialog.getByLabel(`Product ${id}`).check();
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(`Invitation sent to ${mateEmail}`)).toBeVisible();
  await expect(page.getByRole("cell", { name: mateEmail })).toBeVisible();

  // The teammate accepts in a separate browser session.
  const invite = await waitForMail(mateEmail, "invited");
  expect(invite.text).toContain(`Product ${id}`);
  const mate = await (await browser.newContext()).newPage();
  await mate.goto(firstLink(invite.text));
  await mate.getByRole("link", { name: "Create an account" }).click();
  await expect(mate.getByLabel("Work email")).toHaveValue(mateEmail);
  await signUpAndVerify(mate, "Team Mate", mateEmail);
  await expect(mate).toHaveURL(/\/accept-invite\//);
  await mate.getByRole("button", { name: "Accept invitation" }).click();
  await expect(mate).toHaveURL(new RegExp(`/dashboard/${first}$`));

  // Only the granted workspace is visible or reachable.
  await mate.getByRole("button", { name: "Switch workspace" }).click();
  await expect(
    mate.getByRole("menuitem", { name: `Product ${id}` }),
  ).toBeVisible();
  await expect(
    mate.getByRole("menuitem", { name: `Second ${id}` }),
  ).toHaveCount(0);
  await mate.keyboard.press("Escape");
  await mate.goto(`/dashboard/${second}`);
  await expect(mate).toHaveURL(new RegExp(`/dashboard/${first}$`));

  // Members get read-only team and no workspace settings.
  await mate.goto(`/dashboard/${first}/settings/team`);
  await expect(mate.getByTestId(`member-${mateEmail}`)).toContainText("(you)");
  await expect(
    mate.getByRole("button", { name: "Invite teammate" }),
  ).toHaveCount(0);
  await mate.goto(`/dashboard/${first}/settings/workspace`);
  await expect(
    mate.getByText("You don't have access to workspace settings"),
  ).toBeVisible();

  // Owner sees the new member with their workspace access.
  await page.reload();
  await expect(page.getByTestId(`member-${mateEmail}`)).toContainText(
    `Product ${id}`,
  );
});

test("owner renames and deletes a workspace", async ({ page }) => {
  const id = randomUUID().slice(0, 8);
  const { slug: first } = await signUpOwner(page, id);

  await page.getByRole("button", { name: "Switch workspace" }).click();
  await page.getByRole("menuitem", { name: "New workspace" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Product or project name")
    .fill(`Temp ${id}`);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create workspace" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/temp-${id}$`));

  await page.goto(`/dashboard/temp-${id}/settings/workspace`);
  await page.getByLabel("Workspace name").fill(`Renamed ${id}`);
  await page.getByLabel("Workspace URL").fill(`renamed-${id}`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/dashboard/renamed-${id}/settings/workspace$`),
  );
  // Role queries skip the hidden copies Next keeps of earlier pages.
  await expect(page.getByRole("banner")).toContainText(`Renamed ${id}`);

  await page.getByRole("button", { name: "Delete workspace" }).click();
  const confirm = page.getByRole("alertdialog");
  await confirm.getByLabel(/Type/).fill(`Renamed ${id}`);
  await confirm.getByRole("button", { name: "Delete workspace" }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/${first}$`));
});
