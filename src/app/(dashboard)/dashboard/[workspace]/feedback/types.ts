import type { TagOption } from "@/components/dashboard/tag-picker";
import type { FeedbackStatusKind } from "@/server/db/schema";
import type { FeedbackRow } from "@/server/services/feedback";

// Plain data passed from the feedback page (server) to the list (client).

export type { FeedbackRow, TagOption };

export type BoardOption = {
  id: string;
  slug: string;
  name: string;
  isPublic: boolean;
};

export type StatusOption = {
  id: string;
  name: string;
  color: string;
  kind: FeedbackStatusKind;
};

export type CategoryOption = { id: string; name: string; color: string };

export type FeedbackData = {
  workspace: string;
  workspaceId: string;
  canManage: boolean;
  boards: BoardOption[];
  boardId: string | null;
  statuses: StatusOption[];
  categories: CategoryOption[];
  tags: TagOption[];
  items: FeedbackRow[];
};
