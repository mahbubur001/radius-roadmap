import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { env } from "@/lib/env";
import type { Db } from "@/server/db/client";
import {
  cardFollows,
  member,
  roadmapCards,
  roadmaps,
  user,
  workspaces,
} from "@/server/db/schema";
import type { EmailJob } from "@/server/email/types";

// "Email notifications" on a roadmap (doc 24 R4): team members following a
// card hear when it is completed. Idea followers already get the linked
// idea's status change, so they aren't emailed twice. Each card is claimed
// once (completion_notified_at), also when the roadmap's switch is off, so
// switching it on later doesn't email old completions. Runs in the worker:
// no server-only imports.

export type CompletionEmail = { id: string; email: EmailJob };

/** Completed cards of the workspace nobody has been told about yet. */
export async function completionSweep(
  db: Db,
  workspaceId: string,
): Promise<CompletionEmail[]> {
  const claimed = await db
    .update(roadmapCards)
    .set({ completionNotifiedAt: new Date() })
    .where(
      and(
        eq(roadmapCards.workspaceId, workspaceId),
        isNotNull(roadmapCards.completedAt),
        isNull(roadmapCards.completionNotifiedAt),
      ),
    )
    .returning({
      id: roadmapCards.id,
      accountId: roadmapCards.accountId,
      roadmapId: roadmapCards.roadmapId,
      title: roadmapCards.title,
      archivedAt: roadmapCards.archivedAt,
    });

  const out: CompletionEmail[] = [];
  const origin = new URL(env.NEXT_PUBLIC_APP_URL).origin;
  for (const card of claimed) {
    if (card.archivedAt) continue;
    const [roadmap] = await db
      .select({
        title: roadmaps.internalTitle,
        slug: roadmaps.slug,
        notify: roadmaps.notifyOnComplete,
        wsName: workspaces.name,
        wsSlug: workspaces.slug,
      })
      .from(roadmaps)
      .innerJoin(workspaces, eq(workspaces.id, roadmaps.workspaceId))
      .where(eq(roadmaps.id, card.roadmapId))
      .limit(1);
    if (!roadmap?.notify) continue;
    // Only people still in the account.
    const followers = await db
      .select({ userId: user.id, email: user.email })
      .from(cardFollows)
      .innerJoin(user, eq(user.id, cardFollows.userId))
      .innerJoin(
        member,
        and(
          eq(member.userId, cardFollows.userId),
          eq(member.organizationId, card.accountId),
        ),
      )
      .where(
        and(eq(cardFollows.cardId, card.id), eq(user.emailVerified, true)),
      );
    const url = `${origin}/dashboard/${roadmap.wsSlug}/roadmap?r=${roadmap.slug}&card=${card.id}`;
    for (const f of followers) {
      out.push({
        id: `card-done-${card.id}-${f.userId}`,
        email: {
          template: "card-completed",
          to: f.email,
          props: {
            workspaceName: roadmap.wsName,
            roadmapTitle: roadmap.title,
            cardTitle: card.title,
            url,
          },
        },
      });
    }
  }
  return out;
}
