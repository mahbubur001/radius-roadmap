"use client";

import { useEffect } from "react";
import { publicApi, useVoter } from "./voter-provider";

/** Records a page or card view (pages are cached, so this runs client-side). */
export function PageView({ cardId }: { cardId?: string }) {
  const { site, workspaceId, embed } = useVoter();
  useEffect(() => {
    void publicApi(
      "/api/public/events",
      { site, embed },
      {
        method: "POST",
        body: {
          workspaceId,
          type: cardId ? "card_view" : "page_view",
          subjectId: cardId ?? null,
        },
      },
    ).catch(() => undefined);
  }, [site, workspaceId, embed, cardId]);
  return null;
}
