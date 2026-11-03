"use client";

import { Bell, BellOff } from "lucide-react";
import { useVoter } from "./voter-provider";

/** Follow an idea (doc 20 D3). Logged-out visitors are asked to log in. */
export function FollowButton({ feedbackId }: { feedbackId: string }) {
  const { following, toggleFollow } = useVoter();
  const on = following.has(feedbackId);
  const Icon = on ? BellOff : Bell;
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => void toggleFollow(feedbackId)}
      className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-[14px] font-semibold ring-1 ring-rule2 ring-inset hover:bg-paper focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <Icon strokeWidth={1.8} className="size-4" />
      {on ? "Following" : "Follow"}
    </button>
  );
}
