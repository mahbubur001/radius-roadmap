import { expect, type Page } from "@playwright/test";
import { firstLink, waitForMail } from "./mail";

export const PASSWORD = "SuperSecret123!";

/** Fills the sign-up form (email may be prefilled) and verifies the email. */
export async function signUpAndVerify(page: Page, name: string, email: string) {
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/check-email/);

  const mail = await waitForMail(email, "Verify your email");
  await page.goto(firstLink(mail.text));
}

/** New owner: sign up, verify, onboard. Ends on the first workspace. */
export async function signUpOwner(page: Page, id: string) {
  const email = `owner-${id}@example.test`;
  await page.goto("/sign-up");
  await signUpAndVerify(page, "E2E Owner", email);
  await expect(page).toHaveURL(/\/onboarding/);

  await page.getByLabel("Company or team name").fill(`E2E Co ${id}`);
  await page.getByLabel("Product or project name").fill(`Product ${id}`);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(new RegExp(`/product-${id}$`));
  return { email, slug: `product-${id}` };
}
