import { createHmac, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";
import { signUpOwner } from "./helpers";

// Public REST API + webhooks (doc 27). Billing is off in e2e, so the API
// (Enterprise) and webhooks (Pro) are on. The dev server allows webhooks to
// a local receiver; production refuses private addresses (unit tests).

test("API key → REST calls → signed webhook → revoke", async ({
  page,
  request,
}) => {
  const id = randomUUID().slice(0, 8);
  const { slug } = await signUpOwner(page, id);

  // A local receiver for the webhook.
  const received: { headers: Record<string, string>; body: string }[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      received.push({ headers: req.headers as Record<string, string>, body });
      res.writeHead(200).end("thanks");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;

  try {
    // Create a read + write key; it's shown once.
    await page.goto(`/dashboard/${slug}/settings/api`);
    await page.getByRole("textbox", { name: "Key name" }).fill("E2E");
    await page.getByRole("combobox", { name: "Access" }).click();
    await page.getByRole("option", { name: "Read and write" }).click();
    await page.getByRole("button", { name: "Create key" }).click();
    const shown = page.getByRole("dialog", { name: "Your new API key" });
    const key = (await shown.locator("pre").textContent())?.trim() ?? "";
    expect(key).toMatch(/^rr_live_/);
    await shown.getByRole("button", { name: "Done" }).click();
    await expect(
      page.getByRole("listitem").filter({ hasText: "E2E" }),
    ).toContainText("Read and write");
    const auth = { authorization: `Bearer ${key}` };

    // Webhook for new feedback, pointing at the receiver.
    await page.goto(`/dashboard/${slug}/settings/webhooks`);
    await page.getByRole("button", { name: "Add webhook" }).click();
    const form = page.getByRole("dialog", { name: "Add webhook" });
    await form
      .getByRole("textbox", { name: "Endpoint URL" })
      .fill(`http://127.0.0.1:${port}/hook`);
    await form.getByRole("checkbox", { name: "feedback.created" }).click();
    await form.getByRole("button", { name: "Add webhook" }).click();
    await expect(page.getByText("Webhook added.")).toBeVisible();
    const endpoint = page.getByRole("region", {
      name: `http://127.0.0.1:${port}/hook`,
    });
    await endpoint.getByRole("button", { name: "Signing secret" }).click();
    const secret = (await endpoint.locator("pre").textContent())?.trim() ?? "";
    expect(secret).toMatch(/^whsec_/);

    // REST: unauthenticated, then read and write.
    expect((await request.get("/api/v1/account")).status()).toBe(401);
    const account = await request.get("/api/v1/account", { headers: auth });
    expect((await account.json()).data.slug).toBe(`e2e-co-${id}`);
    const boards = await (
      await request.get("/api/v1/feedback-boards", { headers: auth })
    ).json();
    const boardId = boards.data[0].id as string;
    const created = await request.post("/api/v1/feedback", {
      headers: auth,
      data: { board_id: boardId, title: "Sent through the API" },
    });
    expect(created.status()).toBe(201);
    const item = (await created.json()).data;
    expect(item.title).toBe("Sent through the API");

    // It shows up on the dashboard like any other idea.
    await page.goto(`/dashboard/${slug}/feedback`);
    await expect(page.getByText("Sent through the API").first()).toBeVisible();

    // The webhook arrives, signed with the endpoint's secret.
    await expect
      .poll(() => received.some((r) => r.body.includes(item.id)), {
        timeout: 30_000,
      })
      .toBe(true);
    const hook = received.find((r) => r.body.includes(item.id));
    const payload = JSON.parse(hook?.body ?? "{}");
    expect(payload).toMatchObject({
      event: "feedback.created",
      data: { id: item.id, title: "Sent through the API" },
    });
    const sig = hook?.headers["x-radiusroadmap-signature"] ?? "";
    const [t, v1] = sig.split(",").map((p) => p.split("=")[1]);
    expect(v1).toBe(
      createHmac("sha256", secret).update(`${t}.${hook?.body}`).digest("hex"),
    );

    // The delivery is in the log.
    await page.goto(`/dashboard/${slug}/settings/webhooks`);
    await endpoint.getByRole("button", { name: "Recent deliveries" }).click();
    await expect(
      endpoint
        .getByRole("list", { name: "Deliveries" })
        .getByText("feedback.created"),
    ).toBeVisible();

    // Revoked: the key stops working at once.
    await page.goto(`/dashboard/${slug}/settings/api`);
    await page.getByRole("button", { name: "Revoke" }).click();
    await page.getByRole("button", { name: "Revoke key" }).click();
    await expect(page.getByText("Key revoked.")).toBeVisible();
    expect(
      (await request.get("/api/v1/account", { headers: auth })).status(),
    ).toBe(401);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
