import { and, asc, eq } from "drizzle-orm";
import { MAX_ATTACHMENT_BYTES } from "@/lib/schemas/upload";
import type { Db } from "@/server/db/client";
import { cardAttachments, cardFollows, user } from "@/server/db/schema";
import { deleteFile, fileSize, prefixes } from "@/server/storage";
import { contentTypeForKey, keyHasPrefix } from "@/server/storage/keys";
import { getCard } from "./cards";
import {
  ForbiddenError,
  NotFoundError,
  type WorkspaceContext,
} from "./context";
import { inWorkspace } from "./roadmaps";

// Attachments and team follows on roadmap cards (doc 21 step C). Comments
// live in comments.ts (shared with ideas).
// Everyone with access to the workspace can use them; every query is scoped
// by account + workspace through the card.

// ── Attachments ─────────────────────────────────────────────────────────

export function attachmentPrefix(ctx: WorkspaceContext) {
  return prefixes.cardAttachments(ctx.accountId, ctx.workspaceId);
}

export async function listAttachments(
  db: Db,
  ctx: WorkspaceContext,
  cardId: string,
) {
  await getCard(db, ctx, cardId);
  return db
    .select({
      id: cardAttachments.id,
      key: cardAttachments.key,
      name: cardAttachments.name,
      size: cardAttachments.size,
      contentType: cardAttachments.contentType,
      createdAt: cardAttachments.createdAt,
      uploadedBy: user.name,
    })
    .from(cardAttachments)
    .leftJoin(user, eq(user.id, cardAttachments.uploadedBy))
    .where(
      and(
        inWorkspace(cardAttachments, ctx),
        eq(cardAttachments.cardId, cardId),
      ),
    )
    .orderBy(asc(cardAttachments.createdAt));
}

/** Records a file the browser uploaded under this workspace's prefix. */
export async function addAttachment(
  db: Db,
  ctx: WorkspaceContext,
  input: { cardId: string; key: string; name: string },
) {
  await getCard(db, ctx, input.cardId);
  if (!keyHasPrefix(input.key, attachmentPrefix(ctx))) {
    throw new ForbiddenError();
  }
  const contentType = contentTypeForKey(input.key);
  const size = await fileSize(input.key);
  if (!contentType || size === null || size > MAX_ATTACHMENT_BYTES) {
    throw new ForbiddenError("The upload didn't finish. Try again.");
  }
  const [row] = await db
    .insert(cardAttachments)
    .values({
      accountId: ctx.accountId,
      workspaceId: ctx.workspaceId,
      cardId: input.cardId,
      key: input.key,
      name: input.name.trim().slice(0, 200) || "file",
      size,
      contentType,
      uploadedBy: ctx.userId,
    })
    .returning();
  if (!row) throw new Error("Failed to save the attachment.");
  return row;
}

export async function deleteAttachment(
  db: Db,
  ctx: WorkspaceContext,
  id: string,
) {
  const [row] = await db
    .delete(cardAttachments)
    .where(and(inWorkspace(cardAttachments, ctx), eq(cardAttachments.id, id)))
    .returning({ key: cardAttachments.key });
  if (!row) throw new NotFoundError("Attachment not found.");
  await deleteFile(row.key);
}

/** Storage keys of a card's files, to delete them with the card. */
export async function attachmentKeys(
  db: Db,
  ctx: WorkspaceContext,
  cardId: string,
) {
  const rows = await db
    .select({ key: cardAttachments.key })
    .from(cardAttachments)
    .where(
      and(
        inWorkspace(cardAttachments, ctx),
        eq(cardAttachments.cardId, cardId),
      ),
    );
  return rows.map((r) => r.key);
}

// ── Follows (team members; emails from Phase 4) ─────────────────────────

export async function setCardFollow(
  db: Db,
  ctx: WorkspaceContext,
  cardId: string,
  follow: boolean,
) {
  await getCard(db, ctx, cardId);
  if (follow) {
    await db
      .insert(cardFollows)
      .values({ accountId: ctx.accountId, cardId, userId: ctx.userId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(cardFollows)
      .where(
        and(
          eq(cardFollows.accountId, ctx.accountId),
          eq(cardFollows.cardId, cardId),
          eq(cardFollows.userId, ctx.userId),
        ),
      );
  }
}

/** Followers of a card, and whether the caller is one of them. */
export async function cardFollowers(
  db: Db,
  ctx: WorkspaceContext,
  cardId: string,
) {
  await getCard(db, ctx, cardId);
  const rows = await db
    .select({ userId: cardFollows.userId })
    .from(cardFollows)
    .where(
      and(
        eq(cardFollows.accountId, ctx.accountId),
        eq(cardFollows.cardId, cardId),
      ),
    );
  return {
    count: rows.length,
    following: rows.some((r) => r.userId === ctx.userId),
  };
}
