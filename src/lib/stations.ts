import type { ColumnStage } from "./stages";

// The public roadmap's line (doc 32 "Transit"): every public column belongs
// to one of four stations by its stage; done columns are Shipped.

export type StationKey = "now" | "next" | "later" | "done";

type StationColumn = { isDone: boolean; stage: ColumnStage };

export const STATIONS: { key: StationKey; label: string; sub: string }[] = [
  { key: "now", label: "Now", sub: "In progress" },
  { key: "next", label: "Next", sub: "Planned" },
  { key: "later", label: "Later", sub: "Considering" },
  { key: "done", label: "Shipped", sub: "Done" },
];

export function stationOf(column: StationColumn): StationKey {
  if (column.isDone) return "done";
  return column.stage === "in_progress"
    ? "now"
    : column.stage === "planned"
      ? "next"
      : "later";
}

/** The ticket's stamp: the station's name ("Now", "Shipped"). */
export function stampText(key: StationKey) {
  return STATIONS.find((x) => x.key === key)?.label ?? "";
}
