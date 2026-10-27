"use server";

import { headers } from "next/headers";
import {
  type OnboardingInput,
  onboardingSchema,
} from "@/lib/schemas/workspace";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { createWorkspace } from "@/server/services/workspaces";

export type OnboardingResult =
  | { ok: true; workspaceSlug: string }
  | { ok: false; error: string };

export async function completeOnboarding(
  input: OnboardingInput,
): Promise<OnboardingResult> {
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the form." };
  const data = parsed.data;

  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return { ok: false, error: "Please sign in again." };

  let accountId: string;
  try {
    // Creating an organization makes the user its owner and sets it active.
    const org = await auth.api.createOrganization({
      body: { name: data.accountName, slug: data.accountSlug },
      headers: requestHeaders,
    });
    if (!org) return { ok: false, error: "Couldn't create the account." };
    accountId = org.id;
  } catch {
    return { ok: false, error: "That account URL is taken. Try another." };
  }

  try {
    const ws = await createWorkspace(
      db,
      { accountId, userId: session.user.id, role: "owner" },
      { name: data.workspaceName, slug: data.workspaceSlug },
    );
    return { ok: true, workspaceSlug: ws.slug };
  } catch {
    return { ok: false, error: "Couldn't create the workspace." };
  }
}
