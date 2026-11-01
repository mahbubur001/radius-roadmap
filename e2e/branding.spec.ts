import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signUpOwner } from "./helpers";

// Account branding on the public site and the widget (doc 26 6C). Billing is
// off in e2e, so every branding option is available; plan gates and
// downgrades are covered by the unit tests.

/** A valid 1×1 PNG (the upload route checks the magic bytes). */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("brand colour, font, favicon, theme and Powered by reach the public site and widget", async ({
  page,
  browser,
}) => {
  const id = randomUUID().slice(0, 8);
  const { slug } = await signUpOwner(page, id);
  const site = `e2e-co-${id}`;

  await page.goto(`/dashboard/${slug}/settings/branding`);
  await page.getByRole("button", { name: "Brand colour" }).click();
  await page.getByRole("button", { name: "#dc2626" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("combobox", { name: "Font" }).click();
  await page.getByRole("option", { name: "Lora" }).click();
  await page
    .getByRole("switch", { name: "Hide “Powered by Radius Roadmap”" })
    .click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Branding saved.")).toBeVisible();
  // After the form has worked, so the page is hydrated.
  await page
    .locator("section", { hasText: "Favicon" })
    .locator('input[type="file"]')
    .setInputFiles({ name: "icon.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByText("Image updated.")).toBeVisible();

  await page.goto(`/dashboard/${slug}/settings/workspace`);
  await page.getByRole("combobox", { name: "Theme" }).click();
  await page.getByRole("option", { name: "Dark" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Workspace saved.")).toBeVisible();

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`/${site}/roadmap`);
  await expect(visitor.locator("[data-site-theme]")).toHaveAttribute(
    "data-site-theme",
    "dark",
  );
  const look = await visitor.evaluate(() => ({
    primary: getComputedStyle(document.documentElement)
      .getPropertyValue("--primary")
      .trim(),
    font: getComputedStyle(document.body).fontFamily,
    icon: document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href,
  }));
  expect(look.primary).toBe("#dc2626");
  expect(look.font).toContain("Lora");
  expect(look.icon).toMatch(/\/favicon\/[0-9a-f-]{36}\.png$/);
  await expect(visitor.getByText("Powered by Radius Roadmap")).toHaveCount(0);

  // The widget defaults to the brand colour and drops "Powered by" too.
  const config = await visitor.request.get(`/api/widget/config?site=${site}`, {
    headers: { "x-rr-site": site },
  });
  expect(config.ok()).toBe(true);
  const body = await config.json();
  expect(body.settings).toMatchObject({ color: "#dc2626", onColor: "#ffffff" });
  expect(body.brand).toMatchObject({ poweredBy: false });
  expect(body.brand.font.stack).toContain("Lora");
});
