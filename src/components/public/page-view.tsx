"use client";

import { useEffect } from "react";
import { publicApi, useVoter } from "./voter-provider";

/**
 * Records a page, card, idea, post or article view (pages are cached, so this runs
 * client-side).
 */
export function PageView({
  cardId,
  ideaId,
  postId,
  articleId,
}: {
  cardId?: string;
  ideaId?: string;
  postId?: string;
  articleId?: string;
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
                : articleId
                  ? "article_view"
                  : "page_view",
          subjectId: cardId ?? ideaId ?? postId ?? articleId ?? null,
        },
      },
    ).catch(() => undefined);
  }, [site, workspaceId, embed, cardId, ideaId, postId, articleId]);
  return null;
}
