import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { firstLink, waitForMail } from "./mail";

test("sign up, verify email, create a workspace, see the dashboard", async ({
  page,
}) => {
  const id = randomUUID().slice(0, 8);
  const email = `e2e-${id}@example.test`;

  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("E2E Owner");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("SuperSecret123!");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/check-email/);

  const mail = await waitForMail(email);
  expect(mail.subject).toBe("Verify your email address");
  await page.goto(firstLink(mail.text));
  await expect(page).toHaveURL(/\/onboarding/);

  await page.getByLabel("Company or team name").fill(`E2E Co ${id}`);
  await page.getByLabel("Product or project name").fill(`Product ${id}`);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(new RegExp(`/product-${id}$`));
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  await page.getByRole("link", { name: "Roadmap" }).click();
  await expect(page.getByRole("heading", { name: "Roadmap" })).toBeVisible();
});
