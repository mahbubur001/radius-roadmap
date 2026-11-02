// The way from idea to announced (doc 30): every idea and roadmap card has
// one stage, shown as a six-bar "stage tick". Derived from data we already
// keep; only roadmap columns store a stage of their own (`roadmap_stage`).

export const STAGES = [
  "new",
  "review",
  "planned",
  "in_progress",
  "shipped",
  "announced",
] as const;

export type Stage = (typeof STAGES)[number];

/** A roadmap column's stage (done columns are shipped). */
export const COLUMN_STAGES = ["review", "planned", "in_progress"] as const;
export type ColumnStage = (typeof COLUMN_STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  new: "New",
  review: "Under review",
  planned: "Planned",
  in_progress: "In progress",
  shipped: "Shipped",
  announced: "Announced",
};

/** CSS colour per stage (tokens in globals.css). */
export const STAGE_COLORS: Record<Stage, string> = {
  new: "var(--stage-new)",
  review: "var(--stage-review)",
  planned: "var(--stage-planned)",
  in_progress: "var(--stage-progress)",
  shipped: "var(--stage-shipped)",
  announced: "var(--stage-announced)",
};

/** 1 (New) … 6 (Announced): how many bars of the tick are filled. */
export function stageStep(stage: Stage) {
  return STAGES.indexOf(stage) + 1;
}

type FeedbackKind = "open" | "planned" | "in_progress" | "done" | "declined";

/**
 * An idea's stage (doc 30 R1): waiting in the inbox → New; then its status
 * kind; done ideas are Announced once a linked card is in a published update.
 * Declined ideas have no stage (null).
 */
export function feedbackStage(item: {
  review: "pending" | "approved" | "rejected";
  kind: FeedbackKind;
  announced?: boolean;
}): Stage | null {
  if (item.kind === "declined" || item.review === "rejected") return null;
  if (item.review === "pending") return "new";
  if (item.kind === "open") return "review";
  if (item.kind === "done") return item.announced ? "announced" : "shipped";
  return item.kind;
}

/**
 * A card's stage (doc 30 R2): completed cards are Shipped, or Announced when
 * in a published update; otherwise their column's stage.
 */
export function cardStage(card: {
  completed: boolean;
  columnStage: ColumnStage;
  announced?: boolean;
}): Stage {
  if (card.completed) return card.announced ? "announced" : "shipped";
  return card.columnStage;
}
