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
}: {
  cardId?: string;
  ideaId?: string;
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
          type: cardId ? "card_view" : ideaId ? "feedback_view" : "page_view",
          subjectId: cardId ?? ideaId ?? null,
        },
      },
    ).catch(() => undefined);
  }, [site, workspaceId, embed, cardId, ideaId]);
  return null;
}
