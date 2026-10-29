import type { RichTextValue } from "@/components/form/rich-text-editor";
import type { RoadmapDisplaySettings } from "@/lib/schemas/roadmap";
import type { BoardCard } from "@/server/services/cards";

// Plain data passed from the roadmap page (server) to the board (client).

export type { BoardCard };

export type BoardColumn = {
  id: string;
  name: string;
  position: string;
  isPublic: boolean;
  isDone: boolean;
};

export type BoardRoadmap = {
  id: string;
  slug: string;
  internalTitle: string;
  publicTitle: string | null;
  internalSummaryJson: RichTextValue;
  publicSummaryJson: RichTextValue;
  /** Rendered (sanitised) HTML of the internal summary. */
  internalSummaryHtml: string;
  isPublic: boolean;
  notifyOnComplete: boolean;
  display: RoadmapDisplaySettings;
  internalDisplay: RoadmapDisplaySettings;
};

export type ObjectiveOption = { id: string; name: string; color: string };
export type TagOption = { id: string; name: string };

export type BoardData = {
  workspace: string;
  workspaceId: string;
  canManage: boolean;
  /** Public comments are on (Public settings). */
  publicComments: boolean;
  publicUrl: string;
  roadmaps: { id: string; slug: string; title: string }[];
  roadmap: BoardRoadmap;
  columns: BoardColumn[];
  cards: BoardCard[];
  objectives: ObjectiveOption[];
  tags: TagOption[];
};

/** Fractional-index keys are ASCII: plain string comparison is byte order. */
export function byPosition(a: { position: string }, b: { position: string }) {
  return a.position < b.position ? -1 : a.position > b.position ? 1 : 0;
}
