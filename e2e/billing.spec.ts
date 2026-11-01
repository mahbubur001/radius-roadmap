import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signUpOwner } from "./helpers";

test("an owner deletes the account and starts over", async ({ page }) => {
  const id = randomUUID().slice(0, 8);
  const { slug } = await signUpOwner(page, id);
  const name = `E2E Co ${id}`;

  await page.goto(`/dashboard/${slug}/settings/account`);
  await page.getByRole("button", { name: "Delete account" }).click();
  const dialog = page.getByRole("alertdialog");
  const confirm = dialog.getByRole("button", { name: "Delete account" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/to confirm/).fill(name);
  await confirm.click();

  await expect(page).toHaveURL(/\/onboarding/);
  await page.goto(`/dashboard/${slug}`);
  await expect(page).toHaveURL(/\/onboarding/);
  // The public site is gone too.
  const site = await page.request.get(`/e2e-co-${id}/${slug}/roadmap`);
  expect(site.status()).toBe(404);
});

// Needs the dev server started with billing on (any STRIPE_SECRET_KEY; no
// Stripe call is made): E2E_BILLING=1 pnpm test:e2e e2e/billing.spec.ts
test("a Free account hits its limits and is offered an upgrade", async ({
  page,
}) => {
  test.skip(!process.env.E2E_BILLING, "billing is off on the dev server");
  const id = randomUUID().slice(0, 8);
  const { slug } = await signUpOwner(page, id);

  await page.goto(`/dashboard/${slug}/settings/billing`);
  await expect(page.getByText("Free forever.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Upgrade to Startup" }),
  ).toBeVisible();

  // A second workspace is over the Free limit.
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
  await expect(page.getByText("Your plan allows 1 workspace.")).toBeVisible();
  await page.getByRole("button", { name: "Upgrade" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/dashboard/${slug}/settings/billing$`),
  );

  // Comments and follows are locked on Free.
  await page.goto(`/dashboard/${slug}/public-settings`);
  await expect(page.getByRole("switch", { name: /^Comments/ })).toBeDisabled();
  await expect(page.getByRole("switch", { name: /^Follows/ })).toBeDisabled();
});
