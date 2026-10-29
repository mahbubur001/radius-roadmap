"use client";

import { FileText, Paperclip, Pencil, Trash2, Upload } from "lucide-react";
import { Fragment, useRef, useState } from "react";
import { toast } from "sonner";
import {
  addAttachmentAction,
  addCardCommentAction,
  deleteAttachmentAction,
  deleteCardCommentAction,
  type getCardAction,
  requestAttachmentUploadAction,
  updateCardCommentAction,
} from "@/app/(dashboard)/_actions/roadmap";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ATTACHMENT_TYPES,
  type AttachmentType,
  MAX_ATTACHMENT_BYTES,
} from "@/lib/schemas/upload";
import { ago } from "@/lib/time";
import { cn } from "@/lib/utils";

type Detail = Extract<
  Awaited<ReturnType<typeof getCardAction>>,
  { ok: true }
>["data"];
export type Attachment = Detail["attachments"][number];
export type CardComment = Detail["comments"][number];

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Attachments tab: upload button, drop zone and the file list. */
export function Attachments({
  workspace,
  cardId,
  items,
  onChange,
}: {
  workspace: string;
  cardId: string;
  items: Attachment[];
  onChange: (items: Attachment[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  async function upload(file: File): Promise<Attachment | null> {
    if (!(file.type in ATTACHMENT_TYPES)) {
      toast.error(`${file.name}: attach an image (PNG, JPEG, WebP) or a PDF.`);
      return null;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error(`${file.name}: files must be 10 MB or smaller.`);
      return null;
    }
    const form = await requestAttachmentUploadAction({
      workspace,
      cardId,
      contentType: file.type as AttachmentType,
      size: file.size,
    });
    if (!form.ok) {
      toast.error(form.error);
      return null;
    }
    const body = new FormData();
    for (const [k, v] of Object.entries(form.data.fields)) body.append(k, v);
    body.append("file", file); // must be the last field for S3
    const res = await fetch(form.data.url, { method: "POST", body });
    if (!res.ok) {
      toast.error(`${file.name}: upload failed.`);
      return null;
    }
    const saved = await addAttachmentAction({
      workspace,
      cardId,
      key: form.data.key,
      name: file.name,
    });
    if (!saved.ok) {
      toast.error(saved.error);
      return null;
    }
    return saved.data;
  }

  async function uploadAll(files: FileList | File[]) {
    if (busy || !files.length) return;
    setBusy(true);
    const added: Attachment[] = [];
    for (const file of Array.from(files)) {
      const row = await upload(file);
      if (row) added.push(row);
    }
    setBusy(false);
    if (added.length) onChange([...items, ...added]);
  }

  async function remove(id: string) {
    const result = await deleteAttachmentAction({ workspace, id });
    if (!result.ok) return toast.error(result.error);
    onChange(items.filter((a) => a.id !== id));
  }

  return (
    <div className="flex flex-col gap-4">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: drop target only; the button inside is the accessible way to upload */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void uploadAll(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/40 p-6 text-center text-sm",
          over && "border-ring bg-muted",
        )}
      >
        <Button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <Upload />
          {busy ? "Uploading…" : "Upload attachment"}
        </Button>
        <span className="text-muted-foreground">
          Or drop files here · images or PDF, up to 10 MB
        </span>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          aria-label="Attachment files"
          accept={Object.keys(ATTACHMENT_TYPES).join(",")}
          onChange={(e) => {
            if (e.target.files) void uploadAll(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {items.length ? (
        <ul className="flex flex-col divide-y rounded-md border">
          {items.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2">
              {a.contentType.startsWith("image/") ? (
                // biome-ignore lint/performance/noImgElement: user uploads, served as-is
                <img
                  src={a.url}
                  alt=""
                  className="size-10 shrink-0 rounded object-cover"
                />
              ) : (
                <span className="flex size-10 shrink-0 items-center justify-center rounded bg-muted">
                  <FileText className="size-5 text-muted-foreground" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-sm font-medium hover:underline"
                >
                  {a.name}
                </a>
                <p
                  className="text-xs text-muted-foreground"
                  suppressHydrationWarning
                >
                  {formatSize(a.size)}
                  {a.uploadedBy ? ` · ${a.uploadedBy}` : ""} ·{" "}
                  {ago(new Date(a.createdAt))}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${a.name}`}
                onClick={() => remove(a.id)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Paperclip className="size-4" />
          No attachments yet.
        </p>
      )}
    </div>
  );
}

/** Comments tab: team notes on the card (never shown publicly yet). */
export function Comments({
  workspace,
  cardId,
  items,
  me,
  canModerate,
  onChange,
}: {
  workspace: string;
  cardId: string;
  items: CardComment[];
  me: string;
  canModerate: boolean;
  onChange: (items: CardComment[]) => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(
    null,
  );

  async function add() {
    if (!body.trim() || busy) return;
    setBusy(true);
    const result = await addCardCommentAction({ workspace, cardId, body });
    setBusy(false);
    if (!result.ok) return toast.error(result.error);
    onChange([
      ...items,
      {
        id: result.data.id,
        body: body.trim(),
        authorUserId: me,
        author: "You",
        createdAt: result.data.createdAt,
        editedAt: null,
      },
    ]);
    setBody("");
  }

  async function save() {
    if (!editing?.body.trim()) return;
    const result = await updateCardCommentAction({ workspace, ...editing });
    if (!result.ok) return toast.error(result.error);
    onChange(
      items.map((c) =>
        c.id === editing.id
          ? { ...c, body: editing.body.trim(), editedAt: new Date() }
          : c,
      ),
    );
    setEditing(null);
  }

  async function remove(id: string) {
    const result = await deleteCardCommentAction({ workspace, id });
    if (!result.ok) return toast.error(result.error);
    onChange(items.filter((c) => c.id !== id));
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Comments here are for your team only. They don’t show on the public
        roadmap.
      </p>
      {items.length ? (
        <ul className="flex flex-col gap-3">
          {items.map((c) => (
            <li key={c.id} className="group rounded-md border p-3 text-sm">
              <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {c.author ?? "Former member"}
                </span>
                <span suppressHydrationWarning>
                  {ago(new Date(c.createdAt))}
                </span>
                {c.editedAt ? <span>(edited)</span> : null}
                <span className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                  {c.authorUserId === me ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label="Edit comment"
                      onClick={() => setEditing({ id: c.id, body: c.body })}
                    >
                      <Pencil />
                    </Button>
                  ) : null}
                  {c.authorUserId === me || canModerate ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
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
          ))}
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
          placeholder="Write a comment for your team…"
          value={body}
          maxLength={5000}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void add();
          }}
        />
        <Button
          type="submit"
          className="self-end"
          disabled={busy || !body.trim()}
        >
          Add comment
        </Button>
      </form>
    </div>
  );
}

const URL_PATTERN = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;

/** Plain text with http(s) URLs as links. React escapes everything else. */
function Linkified({ text }: { text: string }) {
  return text.split(URL_PATTERN).map((part, i) =>
    i % 2 ? (
      <a
        // biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder
        key={i}
        href={part}
        target="_blank"
        rel="noreferrer nofollow"
        className="text-primary underline"
      >
        {part}
      </a>
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}
