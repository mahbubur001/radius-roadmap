"use server";

import {
  MAX_FAVICON_BYTES,
  MAX_IMAGE_BYTES,
  requestUploadSchema,
  type SaveUploadInput,
  saveUploadSchema,
} from "@/lib/schemas/upload";
import { action } from "@/server/action";
import { db } from "@/server/db/client";
import { invalidateSite } from "@/server/public-cache";
import { getAccount, setAccountLogo } from "@/server/services/accounts";
import { setFavicon } from "@/server/services/branding";
import { assertRole, ForbiddenError } from "@/server/services/context";
import { assertFeature } from "@/server/services/plan-limits";
import { setUserImage } from "@/server/services/profile";
import {
  getWorkspaceById,
  setWorkspaceLogo,
} from "@/server/services/workspaces";
import { requireAccount, requireUser } from "@/server/session";
import {
  checkUploaded,
  createUpload,
  deleteFile,
  fileUrl,
  prefixes,
} from "@/server/storage";
import { keyHasPrefix } from "@/server/storage/keys";

type Target = {
  prefix: string;
  /** Saves the new key (or null) and returns the key it replaced. */
  save: (key: string | null) => Promise<string | null>;
  maxBytes?: number;
};

/** Authorizes the caller for `purpose` and says where its file lives. */
async function resolveTarget(
  purpose: SaveUploadInput["purpose"],
  workspaceId: string | undefined,
): Promise<Target> {
  if (purpose === "avatar") {
    const { user } = await requireUser();
    return {
      prefix: prefixes.avatar(user.id),
      save: (key) => setUserImage(db, user.id, key),
    };
  }

  const ctx = await requireAccount();

  // Anyone who can open the workspace can add images to card descriptions.
  // Nothing is "replaced": the URL goes into the card's rich text.
  if (purpose === "card-image") {
    // Images in content are Pro; logos and favicons aren't (doc 29 T3).
    await assertFeature(db, ctx.accountId, "uploads");
    if (!workspaceId) throw new ForbiddenError("Missing workspace.");
    const ws = await getWorkspaceById(db, ctx, workspaceId);
    return {
      prefix: prefixes.cardImages(ctx.accountId, ws.id),
      save: async () => null,
    };
  }

  assertRole(ctx, "admin");

  if (purpose === "account-logo") {
    return {
      prefix: prefixes.accountLogo(ctx.accountId),
      save: async (key) => {
        const before = (await getAccount(db, ctx)).logo;
        await setAccountLogo(db, ctx, key);
        invalidateSite(ctx.accountId);
        return before;
      },
    };
  }

  if (purpose === "account-favicon") {
    return {
      prefix: prefixes.accountFavicon(ctx.accountId),
      maxBytes: MAX_FAVICON_BYTES,
      save: async (key) => {
        const before = await setFavicon(db, ctx, key);
        invalidateSite(ctx.accountId);
        return before;
      },
    };
  }

  if (!workspaceId) throw new ForbiddenError("Missing workspace.");
  const ws = await getWorkspaceById(db, ctx, workspaceId);
  return {
    prefix: prefixes.workspaceLogo(ctx.accountId, ws.id),
    save: async (key) => {
      await setWorkspaceLogo(db, ctx, ws.id, key);
      return ws.logo;
    },
  };
}

export const requestUploadAction = action(
  requestUploadSchema,
  async ({ purpose, workspaceId, contentType, size }) => {
    const target = await resolveTarget(purpose, workspaceId);
    if (target.maxBytes && size > target.maxBytes) {
      throw new ForbiddenError(
        `Files must be ${target.maxBytes / 1024} KB or smaller.`,
      );
    }
    return createUpload(
      target.prefix,
      contentType,
      size,
      target.maxBytes ?? MAX_IMAGE_BYTES,
    );
  },
);

export const saveUploadAction = action(
  saveUploadSchema,
  async ({ purpose, workspaceId, key }) => {
    const target = await resolveTarget(purpose, workspaceId);
    if (key !== null) {
      if (!keyHasPrefix(key, target.prefix)) throw new ForbiddenError();
      if (!(await checkUploaded(key, target.maxBytes ?? MAX_IMAGE_BYTES))) {
        throw new ForbiddenError("The upload didn't finish. Try again.");
      }
    }
    const previous = await target.save(key);
    if (previous && previous !== key) await deleteFile(previous);
    return { url: fileUrl(key) };
  },
);
