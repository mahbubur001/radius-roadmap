import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signUpOwner } from "./helpers";

test("sign up, verify email, create a workspace, see the dashboard", async ({
  page,
}) => {
  await signUpOwner(page, randomUUID().slice(0, 8));

  await expect(
    page.getByRole("heading", { name: "You're all caught up" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Signal" })).toBeVisible();
  await page.getByRole("link", { name: "Roadmap" }).click();
  await expect(page.getByRole("region", { name: "Up next" })).toBeVisible();
});
