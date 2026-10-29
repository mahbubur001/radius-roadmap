"use client";

import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVoter } from "./voter-provider";

/** Follow an idea (doc 20 D3). Logged-out visitors are asked to log in. */
export function FollowButton({ feedbackId }: { feedbackId: string }) {
  const { following, toggleFollow } = useVoter();
  const on = following.has(feedbackId);
  return (
    <Button
      variant="outline"
      aria-pressed={on}
      onClick={() => void toggleFollow(feedbackId)}
    >
      {on ? <BellOff /> : <Bell />}
      {on ? "Following" : "Follow"}
    </Button>
  );
}
