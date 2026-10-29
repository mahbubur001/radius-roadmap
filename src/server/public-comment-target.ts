import "server-only";
import type { Db } from "@/server/db/client";
import type { CommentTarget } from "@/server/services/comments";
import type { PublicContext } from "@/server/services/context";
import { getVotableIdea } from "@/server/services/public-ideas";
import {
  getPublicWorkspaceById,
  getVotableCard,
} from "@/server/services/public-site";

/**
 * The idea or card a public comment is about, if it's visible on this site
 * and its workspace has comments on (doc 20 D3). Null means 404.
 */
export async function publicCommentTarget(
  db: Db,
  ctx: PublicContext,
  input: { feedbackId?: string; cardId?: string },
) {
  const found = input.feedbackId
    ? await getVotableIdea(db, ctx, input.feedbackId)
    : input.cardId
      ? await getVotableCard(db, ctx, input.cardId)
      : null;
  if (!found) return null;
  const ws = await getPublicWorkspaceById(db, ctx, found.workspaceId);
  if (!ws?.settings.commentsEnabled) return null;
  const target: CommentTarget = input.feedbackId
    ? { feedbackId: input.feedbackId }
    : { cardId: input.cardId ?? "" };
  return {
    target,
    workspaceId: found.workspaceId,
    holdForApproval: !!ws.settings.approveComments,
    requireVoterLogin: !!ws.settings.requireVoterLogin,
    followsEnabled: !!ws.settings.followsEnabled,
  };
}
