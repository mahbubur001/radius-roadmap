"use client";

import { Check, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  approveCommentAction,
  deleteCommentAction,
} from "@/app/(dashboard)/_actions/comments";
import { Linkified } from "@/components/linkified";
import { Button } from "@/components/ui/button";
import { ago } from "@/lib/time";
import type { PendingComment } from "@/server/services/comments";

export function CommentsModeration({
  workspace,
  items: initial,
}: {
  workspace: string;
  items: PendingComment[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);

  async function act(id: string, approve: boolean) {
    const result = approve
      ? await approveCommentAction({ workspace, id })
      : await deleteCommentAction({ workspace, id });
    if (!result.ok) return toast.error(result.error);
    setItems((all) => all.filter((c) => c.id !== id));
    toast.success(approve ? "Comment approved." : "Comment deleted.");
    router.refresh();
  }

  if (!items.length) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Nothing waiting. You're all caught up.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3" aria-label="Comments to approve">
      {items.map((c) => {
        const href =
          c.target.kind === "idea"
            ? `/dashboard/${workspace}/feedback?state=all&feedback=${c.target.id}`
            : `/dashboard/${workspace}/roadmap?r=${c.target.roadmap}&card=${c.target.id}`;
        return (
          <li key={c.id} className="flex flex-col gap-2 rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{c.author}</span>
              on
              <Link href={href} className="font-medium text-primary underline">
                {c.target.kind === "idea" ? "idea" : "card"} “{c.target.title}”
              </Link>
              <span suppressHydrationWarning>{ago(new Date(c.createdAt))}</span>
            </div>
            <p className="break-words whitespace-pre-wrap text-sm">
              <Linkified text={c.body} />
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => act(c.id, true)}>
                <Check />
                Approve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => act(c.id, false)}
              >
                <Trash2 />
                Delete
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
