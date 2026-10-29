"use client";

import { createContext, useContext } from "react";
import { defaultInternalDisplay } from "@/lib/schemas/roadmap";
import type { BoardRoadmap, TagOption } from "./types";

// The roadmap's internal display toggles (doc 24 R2) and the tag names,
// read by every card on the board without threading props through dnd-kit.

type BoardDisplay = {
  display: BoardRoadmap["internalDisplay"];
  tags: TagOption[];
};

const BoardDisplayContext = createContext<BoardDisplay>({
  display: defaultInternalDisplay,
  tags: [],
});

export const BoardDisplayProvider = BoardDisplayContext.Provider;

export function useBoardDisplay() {
  return useContext(BoardDisplayContext);
}
