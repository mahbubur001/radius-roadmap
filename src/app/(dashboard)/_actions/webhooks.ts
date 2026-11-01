"use server";

import { z } from "zod";
import { webhookEndpointSchema } from "@/lib/schemas/webhooks";
import { workspaceAction } from "@/server/action";
import { db } from "@/server/db/client";
import { queueDelivery } from "@/server/queue/webhooks";
import {
  createEndpoint,
  deleteEndpoint,
  listDeliveries,
  resendDelivery,
  revealSecret,
  rotateSecret,
  setEndpointEnabled,
  testDelivery,
  updateEndpoint,
} from "@/server/services/webhooks";

// Settings → Webhooks (doc 27 step 4).

const byId = z.object({ id: z.uuid() });

export const createEndpointAction = workspaceAction(
  webhookEndpointSchema,
  (ctx, input) => createEndpoint(db, ctx, input),
);

export const updateEndpointAction = workspaceAction(
  webhookEndpointSchema.extend(byId.shape),
  (ctx, { id, ...input }) => updateEndpoint(db, ctx, id, input),
);

export const deleteEndpointAction = workspaceAction(byId, (ctx, { id }) =>
  deleteEndpoint(db, ctx, id),
);

export const setEndpointEnabledAction = workspaceAction(
  byId.extend({ enabled: z.boolean() }),
  (ctx, { id, enabled }) => setEndpointEnabled(db, ctx, id, enabled),
);

/** Fetched on demand so the secret isn't in the page's HTML. */
export const revealSecretAction = workspaceAction(byId, (ctx, { id }) =>
  revealSecret(db, ctx, id),
);

export const rotateSecretAction = workspaceAction(byId, (ctx, { id }) =>
  rotateSecret(db, ctx, id),
);

export const listDeliveriesAction = workspaceAction(byId, async (ctx, { id }) =>
  (await listDeliveries(db, ctx, id)).map((d) => ({
    ...d,
    createdAt: d.createdAt.toISOString(),
  })),
);

export const testDeliveryAction = workspaceAction(byId, async (ctx, { id }) => {
  const deliveryId = await testDelivery(db, ctx, id);
  if (deliveryId) await queueDelivery(deliveryId);
});

export const resendDeliveryAction = workspaceAction(
  byId,
  async (ctx, { id }) => {
    const deliveryId = await resendDelivery(db, ctx, id);
    if (deliveryId) await queueDelivery(deliveryId);
  },
);
