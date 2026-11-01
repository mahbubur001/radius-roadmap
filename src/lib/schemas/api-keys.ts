import { z } from "zod";

// Settings → API (doc 27 A1, A2).

export const API_KEY_PERMISSIONS = ["read", "write"] as const;

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1, "Give the key a name").max(60),
  permission: z.enum(API_KEY_PERMISSIONS),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
