"use client";

import { Check, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  addCommentAction,
  approveCommentAction,
  deleteCommentAction,
  updateCommentAction,
} from "@/app/(dashboard)/_actions/comments";
import { Linkified } from "@/components/linkified";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ago } from "@/lib/time";
import type { TeamComment } from "@/server/services/comments";

/**
 * Comments tab of the idea and card drawers (doc 20 step 7): visitors'
 * comments (approve / delete), team replies and internal notes.
 */
export function CommentsPanel({
  workspace,
  target,
  items,
  me,
  canModerate,
  publicComments,
  onChange,
}: {
  workspace: string;
  target: { feedbackId: string } | { cardId: string };
  items: TeamComment[];
  me: string;
  /** Owners and admins may delete other members' comments. */
  canModerate: boolean;
  /** Public comments are on for the workspace. */
  publicComments: boolean;
  onChange: (items: TeamComment[]) => void;
}) {
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(!publicComments);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(
    null,
  );
  const asNote = internal || !publicComments;

  async function add() {
    const sent = body;
    if (!sent.trim() || busy) return;
    setBusy(true);
    const result = await addCommentAction({
      workspace,
      ...target,
      body: sent,
      internal: asNote,
    });
    setBusy(false);
    if (!result.ok) return toast.error(result.error);
    onChange([
      ...items,
      {
        id: result.data.id,
        body: sent.trim(),
        internal: asNote,
        pending: false,
        author: "You",
        authorUserId: me,
        team: true,
        createdAt: result.data.createdAt,
        editedAt: null,
      },
    ]);
    // Keep anything typed while the comment was being saved.
    setBody((current) => (current === sent ? "" : current));
  }

  async function save() {
    if (!editing?.body.trim()) return;
    const { id, body: next } = editing;
    const result = await updateCommentAction({ workspace, id, body: next });
    if (!result.ok) return toast.error(result.error);
    onChange(
      items.map((c) =>
        c.id === id ? { ...c, body: next.trim(), editedAt: new Date() } : c,
      ),
    );
    setEditing(null);
  }

  async function approve(id: string) {
    const result = await approveCommentAction({ workspace, id });
    if (!result.ok) return toast.error(result.error);
    onChange(items.map((c) => (c.id === id ? { ...c, pending: false } : c)));
  }

  async function remove(id: string) {
    const result = await deleteCommentAction({ workspace, id });
    if (!result.ok) return toast.error(result.error);
    onChange(items.filter((c) => c.id !== id));
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        {publicComments
          ? "Replies show on the public site, marked “Team”. Internal notes stay with your team."
          : "Public comments are off (Public settings), so everything here stays with your team."}
      </p>
      {items.length ? (
        <ul className="flex flex-col gap-3" aria-label="Comments">
          {items.map((c) => {
            const mine = c.authorUserId === me;
            const canDelete = !c.team || mine || canModerate;
            return (
              <li
                key={c.id}
                className="group rounded-md border p-3 text-sm data-[internal=true]:border-dashed data-[internal=true]:bg-muted/40"
                data-internal={c.internal}
              >
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {mine ? "You" : c.author}
                  </span>
                  {c.team && !c.internal && publicComments ? (
                    <Badge variant="secondary">Team</Badge>
                  ) : null}
                  {c.internal && publicComments ? (
                    <Badge variant="outline">Internal note</Badge>
                  ) : null}
                  {c.pending ? (
                    <Badge variant="outline">Waiting for approval</Badge>
                  ) : null}
                  <span suppressHydrationWarning>
                    {ago(new Date(c.createdAt))}
                  </span>
                  {c.editedAt ? <span>(edited)</span> : null}
                  <span className="ml-auto flex gap-1">
                    {c.pending ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7"
                        onClick={() => approve(c.id)}
                      >
                        <Check />
                        Approve
                      </Button>
                    ) : null}
                    {mine ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        aria-label="Edit comment"
                        onClick={() => setEditing({ id: c.id, body: c.body })}
                      >
                        <Pencil />
                      </Button>
                    ) : null}
                    {canDelete ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        aria-label="Delete comment"
                        onClick={() => remove(c.id)}
                      >
                        <Trash2 />
                      </Button>
                    ) : null}
                  </span>
                </div>
                {editing?.id === c.id ? (
                  <div className="flex flex-col gap-2">
                    <Textarea
                      aria-label="Edit comment"
                      value={editing.body}
                      maxLength={5000}
                      onChange={(e) =>
                        setEditing({ id: c.id, body: e.target.value })
                      }
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={save}>
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="break-words whitespace-pre-wrap">
                    <Linkified text={c.body} />
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Textarea
          aria-label="New comment"
          placeholder={
            asNote ? "Write a note for your team…" : "Write a public reply…"
          }
          value={body}
          maxLength={5000}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void add();
          }}
        />
        <div className="flex items-center gap-3">
          {publicComments ? (
            <Label className="flex items-center gap-2 font-normal">
              <Switch checked={internal} onCheckedChange={setInternal} />
              Internal note
            </Label>
          ) : null}
          <Button
            type="submit"
            className="ml-auto"
            disabled={busy || !body.trim()}
          >
            {asNote ? "Add note" : "Reply"}
          </Button>
        </div>
      </form>
    </div>
  );
}
