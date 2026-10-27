"use server";

import {
  MAX_IMAGE_BYTES,
  requestUploadSchema,
  type SaveUploadInput,
  saveUploadSchema,
} from "@/lib/schemas/upload";
import { action } from "@/server/action";
import { db } from "@/server/db/client";
import { getAccount, setAccountLogo } from "@/server/services/accounts";
import { assertRole, ForbiddenError } from "@/server/services/context";
import { setUserImage } from "@/server/services/profile";
import {
  getWorkspaceById,
  setWorkspaceLogo,
} from "@/server/services/workspaces";
import { requireAccount, requireUser } from "@/server/session";
import {
  createUpload,
  deleteFile,
  fileSize,
  fileUrl,
  prefixes,
} from "@/server/storage";
import { keyHasPrefix } from "@/server/storage/keys";

type Target = {
  prefix: string;
  /** Saves the new key (or null) and returns the key it replaced. */
  save: (key: string | null) => Promise<string | null>;
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
  assertRole(ctx, "admin");

  if (purpose === "account-logo") {
    return {
      prefix: prefixes.accountLogo(ctx.accountId),
      save: async (key) => {
        const before = (await getAccount(db, ctx)).logo;
        await setAccountLogo(db, ctx, key);
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
  async ({ purpose, workspaceId, contentType }) => {
    const target = await resolveTarget(purpose, workspaceId);
    return createUpload(target.prefix, contentType);
  },
);

export const saveUploadAction = action(
  saveUploadSchema,
  async ({ purpose, workspaceId, key }) => {
    const target = await resolveTarget(purpose, workspaceId);
    if (key !== null) {
      if (!keyHasPrefix(key, target.prefix)) throw new ForbiddenError();
      const size = await fileSize(key);
      if (size === null || size > MAX_IMAGE_BYTES) {
        throw new ForbiddenError("The upload didn't finish. Try again.");
      }
    }
    const previous = await target.save(key);
    if (previous && previous !== key) await deleteFile(previous);
    return { url: fileUrl(key) };
  },
);
