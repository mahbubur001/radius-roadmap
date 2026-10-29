"use client";

import { useEffect } from "react";
import { publicApi, useVoter } from "./voter-provider";

/**
 * Records a page, card or idea view (pages are cached, so this runs
 * client-side).
 */
export function PageView({
  cardId,
  ideaId,
  postId,
}: {
  cardId?: string;
  ideaId?: string;
  postId?: string;
}) {
  const { site, workspaceId, embed } = useVoter();
  useEffect(() => {
    void publicApi(
      "/api/public/events",
      { site, embed },
      {
        method: "POST",
        body: {
          workspaceId,
          type: cardId
            ? "card_view"
            : ideaId
              ? "feedback_view"
              : postId
                ? "update_view"
                : "page_view",
          subjectId: cardId ?? ideaId ?? postId ?? null,
        },
      },
    ).catch(() => undefined);
  }, [site, workspaceId, embed, cardId, ideaId, postId]);
  return null;
}
