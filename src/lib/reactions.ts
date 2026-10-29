/** The four fixed reactions on update posts (doc 23 U4). */
export const REACTIONS = [
  { key: "thumbs_up", emoji: "👍", label: "Thumbs up" },
  { key: "heart", emoji: "❤️", label: "Love it" },
  { key: "tada", emoji: "🎉", label: "Celebrate" },
  { key: "eyes", emoji: "👀", label: "Watching" },
] as const;

export type ReactionKey = (typeof REACTIONS)[number]["key"];
export type ReactionCounts = Partial<Record<ReactionKey, number>>;
