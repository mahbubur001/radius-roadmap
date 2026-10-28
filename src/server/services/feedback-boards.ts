import type { DbOrTx } from "@/server/db/client";
import {
  type FeedbackStatusKind,
  feedbackBoards,
  feedbackStatuses,
} from "@/server/db/schema";
import { keyAfter } from "./positions";

// Feedback boards and statuses (doc 20 §3.1–3.2).

/** Doc 16 §8 #3: status is separate from category. */
export const DEFAULT_STATUSES: {
  name: string;
  color: string;
  kind: FeedbackStatusKind;
}[] = [
  { name: "New", color: "#64748b", kind: "open" },
  { name: "Under review", color: "#0891b2", kind: "open" },
  { name: "Planned", color: "#7c3aed", kind: "planned" },
  { name: "In progress", color: "#2563eb", kind: "in_progress" },
  { name: "Done", color: "#16a34a", kind: "done" },
  { name: "Declined", color: "#dc2626", kind: "declined" },
];

export const DEFAULT_BOARD = {
  name: "Feature requests",
  slug: "feature-requests",
};

/** Defaults for a new workspace: one public board + the default statuses. */
export async function seedFeedback(
  db: DbOrTx,
  accountId: string,
  workspaceId: string,
) {
  let position: string | null = null;
  await db.insert(feedbackStatuses).values(
    DEFAULT_STATUSES.map((s) => {
      position = keyAfter(position);
      return { ...s, accountId, workspaceId, position };
    }),
  );
  await db.insert(feedbackBoards).values({
    ...DEFAULT_BOARD,
    accountId,
    workspaceId,
    position: keyAfter(null),
  });
}
