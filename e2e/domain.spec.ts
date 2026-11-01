import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signUpOwner } from "./helpers";

// A customer's own domain (doc 26 6D). In development `*.localhost` hosts
// verify without DNS (D9) and Chromium resolves them to 127.0.0.1, so the
// dev server answers on e2e-<id>.localhost:3000.

test("custom domain: verify, serve the public site there, redirect, remove", async ({
  page,
  browser,
}) => {
  const id = randomUUID().slice(0, 8);
  const { slug } = await signUpOwner(page, id);
  const site = `e2e-co-${id}`;
  const app = new URL(page.url()).origin;
  const host = `e2e-${id}.localhost`;
  const custom = `${new URL(app).protocol}//${host}:${new URL(app).port}`;

  await page.goto(`/dashboard/${slug}/settings/domain`);
  await page.getByRole("textbox", { name: "Domain" }).fill(`https://${host}/`);
  await page.getByRole("button", { name: "Add domain" }).click();
  await expect(page.getByText("Waiting for DNS")).toBeVisible();
  await expect(page.getByText(`_radius-roadmap.${host}`)).toBeVisible();
  await page.getByRole("button", { name: "Check now" }).click();
  await expect(page.getByText("Your domain is live.")).toBeVisible();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();

  // The dashboard's public links use the domain.
  await page.goto(`/dashboard/${slug}/roadmap`);
  await page.getByRole("button", { name: "More" }).click();
  await expect(
    page.getByRole("menuitem", { name: "View public roadmap" }),
  ).toHaveAttribute("href", `${custom}/roadmap`);
  await page.keyboard.press("Escape");

  // Old app-domain links move to the domain (D5); links there drop the account.
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`${app}/${site}/roadmap`);
  await expect(visitor).toHaveURL(`${custom}/roadmap`);
  const nav = visitor.getByRole("navigation", { name: "Site" });
  await expect(nav.getByRole("link", { name: "Roadmap" })).toHaveAttribute(
    "href",
    "/roadmap",
  );
  const canonical = await visitor
    .locator('link[rel="canonical"]')
    .getAttribute("href");
  expect(canonical).toBe(`${custom}/roadmap`);

  // Nothing of the app is served on the customer's domain (D7).
  for (const path of [
    `/dashboard/${slug}`,
    "/sign-in",
    "/api/auth/get-session",
  ]) {
    const res = await visitor.goto(`${custom}${path}`);
    expect(res?.status(), path).toBe(404);
  }

  // Embeds stay on the app domain.
  const embed = await visitor.goto(`${app}/${site}/roadmap?embed=1`);
  expect(embed?.status()).toBe(200);
  expect(visitor.url()).toBe(`${app}/${site}/roadmap?embed=1`);

  // Removed: the app-domain address serves the site again. (A browser that
  // saw the redirect keeps it for up to an hour, so a new visitor checks.)
  await page.goto(`/dashboard/${slug}/settings/domain`);
  await page.getByRole("button", { name: "Remove domain" }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("textbox").fill(host);
  await dialog.getByRole("button", { name: "Remove domain" }).click();
  await expect(page.getByText("Domain removed.")).toBeVisible();
  const later = await (await browser.newContext()).newPage();
  const back = await later.goto(`${app}/${site}/roadmap`);
  expect(back?.status()).toBe(200);
  expect(later.url()).toBe(`${app}/${site}/roadmap`);
  expect((await later.goto(`${custom}/roadmap`))?.status()).toBe(404);
});
