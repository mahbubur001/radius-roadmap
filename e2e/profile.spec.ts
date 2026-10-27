import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signUpOwner } from "./helpers";
import { waitForMail } from "./mail";

// 1×1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

test("upload an avatar, then remove it", async ({ page }) => {
  const { slug } = await signUpOwner(page, randomUUID().slice(0, 8));
  await page.goto(`/${slug}/settings/profile`);
  await page.waitForLoadState("networkidle"); // hydrated

  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload" }).click();
  await (await chooser).setFiles({
    name: "me.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect(page.getByText("Image updated.")).toBeVisible();
  const img = page.getByRole("main").locator("img").first();
  await expect(img).toHaveAttribute("src", /^\/api\/files\/users\/.+\.png$/);
  const src = (await img.getAttribute("src")) ?? "";
  expect((await page.request.get(src)).status()).toBe(200);

  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Image removed.")).toBeVisible();
  expect((await page.request.get(src)).status()).toBe(404);
});

test("changing email asks the current address to approve", async ({ page }) => {
  const { slug, email } = await signUpOwner(page, randomUUID().slice(0, 8));
  await page.goto(`/${slug}/settings/profile`);
  await page.getByLabel("New email").fill(`new-${email}`);
  await page.getByRole("button", { name: "Change email" }).click();
  await expect(
    page.getByText("Nothing changes until both links are opened"),
  ).toBeVisible();
  const mail = await waitForMail(email, "Confirm your new email");
  expect(mail.text).toContain(`new-${email}`);
});

test("Better Auth's own team endpoints are disabled", async ({ page }) => {
  await signUpOwner(page, randomUUID().slice(0, 8));
  for (const path of ["invite-member", "update-member-role", "remove-member"]) {
    const res = await page.request.post(`/api/auth/organization/${path}`, {
      data: {},
    });
    expect(res.status(), path).toBe(404);
  }
});
