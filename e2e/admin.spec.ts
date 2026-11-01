import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { PASSWORD, signUpAndVerify, signUpOwner } from "./helpers";
import { firstLink, waitForMail } from "./mail";

// Platform admin (doc 28). Needs `PLATFORM_ADMIN_EMAILS` to include
// platform-admin@example.test in the dev server's .env.local.

const ADMIN = "platform-admin@example.test";

/** Signs in as the platform admin, creating the login on the first run. */
async function signInAdmin(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(ADMIN);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page
    .waitForURL((url) => !url.pathname.startsWith("/sign-in"), {
      timeout: 5_000,
    })
    .catch(async () => {
      await page.goto("/sign-up");
      await signUpAndVerify(page, "Platform Admin", ADMIN);
    });
}

test("platform admin: 404 for others, invite a customer with Pro, suspend and restore", async ({
  page,
  browser,
}) => {
  const id = randomUUID().slice(0, 8);

  // Anyone else gets a plain 404 (doc 28 C2).
  const stranger = await (await browser.newContext()).newPage();
  expect((await stranger.goto("/admin"))?.status()).toBe(404);
  await signUpOwner(stranger, id);
  expect((await stranger.goto("/admin/accounts"))?.status()).toBe(404);

  await signInAdmin(page);
  expect((await page.goto("/admin"))?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  // Invite a customer on the Pro plan.
  const owner = `customer-${id}@example.test`;
  await page.goto("/admin/accounts/new");
  await page
    .getByRole("textbox", { name: "Company name" })
    .fill(`Customer ${id}`);
  await expect(page.getByRole("textbox", { name: "Account URL" })).toHaveValue(
    `customer-${id}`,
  );
  await page
    .getByRole("textbox", { name: "First product or project" })
    .fill(`App ${id}`);
  await page.getByRole("textbox", { name: "Owner's email" }).fill(owner);
  await page.getByRole("combobox", { name: "Plan" }).click();
  await page.getByRole("option", { name: "Pro" }).click();
  await page.getByRole("textbox", { name: /Note/ }).fill("Launch partner");
  await page.getByRole("button", { name: "Create account and invite" }).click();
  await expect(page.getByText(`Invitation sent to ${owner}.`)).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/accounts\/acct_/);
  const accountUrl = page.url();
  await expect(page.getByText(`Owner invitation for ${owner}`)).toBeVisible();

  // The customer accepts, becomes owner, and is on Pro (granted).
  const mail = await waitForMail(owner, "is ready");
  const customer = await (await browser.newContext()).newPage();
  await customer.goto(firstLink(mail.text));
  await customer.getByRole("link", { name: "Create an account" }).click();
  await signUpAndVerify(customer, "New Customer", owner);
  await expect(customer).toHaveURL(/\/accept-invite\//);
  await customer.getByRole("button", { name: "Accept invitation" }).click();
  await expect(customer).toHaveURL(new RegExp(`/dashboard/app-${id}$`));
  // (Billing is off in e2e, so the plan is checked on the admin page.)
  await page.goto(accountUrl);
  await expect(page.getByText(`${owner} · owner`)).toBeVisible();
  await expect(
    page.getByText(/granted.*platform-admin@example\.test/),
  ).toBeVisible();

  // Suspend: the dashboard and the public site stop.
  await page.getByRole("button", { name: "Suspend account" }).click();
  await page
    .getByLabel("Reason (kept in the audit log)")
    .fill("Testing suspension");
  await page.getByRole("button", { name: "Suspend", exact: true }).click();
  await expect(page.getByText("Account suspended.")).toBeVisible();
  await customer.goto(`/dashboard/app-${id}`);
  await expect(customer).toHaveURL(/\/suspended$/);
  const visitor = await (await browser.newContext()).newPage();
  expect((await visitor.goto(`/customer-${id}/roadmap`))?.status()).toBe(503);

  // Restore: everything works again; the history shows it all.
  await page.getByRole("button", { name: "Restore account" }).click();
  await expect(page.getByText("Account restored.")).toBeVisible();
  await customer.goto(`/dashboard/app-${id}`);
  await expect(customer).toHaveURL(new RegExp(`/dashboard/app-${id}$`));
  expect((await visitor.goto(`/customer-${id}/roadmap`))?.status()).toBe(200);
  await page.reload();
  for (const line of [
    "Invited the customer",
    "Set a plan",
    "Suspended the account",
    "Restored the account",
  ]) {
    await expect(page.getByText(line)).toBeVisible();
  }

  // Found by the owner's email in the list.
  await page.goto(`/admin/accounts?q=${encodeURIComponent(owner)}`);
  await expect(
    page.getByRole("link", { name: `Customer ${id}` }),
  ).toBeVisible();
});
