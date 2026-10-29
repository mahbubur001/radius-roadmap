"use client";

import { ArrowLeft, Copy, ImageUp, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  deleteUpdateAction,
  duplicateUpdateAction,
  patchUpdateAction,
  searchCardsForUpdateAction,
  setUpdateCardsAction,
} from "@/app/(dashboard)/_actions/updates";
import {
  requestUploadAction,
  saveUploadAction,
} from "@/app/(dashboard)/_actions/uploads";
import {
  autosaveLabel,
  useAutosave,
} from "@/components/dashboard/use-autosave";
import {
  RichTextEditor,
  type RichTextValue,
} from "@/components/form/rich-text-editor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { PatchUpdateInput } from "@/lib/schemas/updates";
import {
  IMAGE_TYPES,
  type ImageType,
  MAX_IMAGE_BYTES,
} from "@/lib/schemas/upload";
import { ago } from "@/lib/time";
import type { getUpdateDetail } from "@/server/services/updates";
import type { CategoryOption } from "../categories-dialog";

type Post = Awaited<ReturnType<typeof getUpdateDetail>> & {
  coverUrl: string | null;
};
type Patch = Omit<PatchUpdateInput, "id">;
type ShippedCard = Post["cards"][number];

const NONE = "none";

/** The post editor (doc 23 step 2): content on the left, settings rail. */
export function UpdateEditor({
  workspace,
  workspaceId,
  post,
  categories,
}: {
  workspace: string;
  workspaceId: string;
  post: Post;
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const base = `/dashboard/${workspace}/updates`;
  const [title, setTitle] = useState(post.title);
  const [categoryId, setCategoryId] = useState(post.categoryId);
  const [isPublic, setIsPublic] = useState(post.isPublic);
  const [pinned, setPinned] = useState(post.pinned);
  const [emailSubscribers, setEmailSubscribers] = useState(
    post.emailSubscribers,
  );
  const [cards, setCards] = useState<ShippedCard[]>(post.cards);
  const [updatedAt, setUpdatedAt] = useState(new Date(post.updatedAt));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = useCallback(
    async (patch: Patch) => {
      const result = await patchUpdateAction({
        workspace,
        id: post.id,
        ...patch,
      });
      if (!result.ok) toast.error(result.error);
      else setUpdatedAt(new Date(result.data.updatedAt));
      return result.ok;
    },
    [workspace, post.id],
  );
  const { schedule, flush, status } = useAutosave<Patch>(save);
  useEffect(() => () => void flush(), [flush]);

  async function saveCards(next: ShippedCard[]) {
    const before = cards;
    setCards(next);
    const result = await setUpdateCardsAction({
      workspace,
      id: post.id,
      cardIds: next.map((c) => c.id),
    });
    if (!result.ok) {
      setCards(before);
      toast.error(result.error);
    }
  }

  async function duplicate() {
    await flush();
    const result = await duplicateUpdateAction({ workspace, id: post.id });
    if (!result.ok) return toast.error(result.error);
    toast.success("Post duplicated.");
    router.push(`${base}/${result.data.id}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={post.status === "published" ? base : `${base}?tab=${post.status}`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to updates
      </Link>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Input
            aria-label="Title"
            className="h-auto border-none bg-transparent px-0 text-2xl font-semibold shadow-none focus-visible:ring-0 md:text-2xl dark:bg-transparent"
            value={title}
            maxLength={200}
            onChange={(e) => {
              setTitle(e.target.value);
              if (e.target.value.trim()) schedule({ title: e.target.value });
            }}
          />
          <RichTextEditor
            label="Post"
            workspaceId={workspaceId}
            value={post.bodyJson as RichTextValue}
            onChange={(bodyJson) => schedule({ bodyJson })}
          />
          <p
            className="text-xs text-muted-foreground"
            aria-live="polite"
            suppressHydrationWarning
          >
            {autosaveLabel(status) || "All changes saved"} · Last updated{" "}
            {ago(updatedAt)}
          </p>
        </div>

        <aside
          aria-label="Post settings"
          className="flex w-full shrink-0 flex-col gap-5 rounded-lg border bg-muted/30 p-5 lg:w-80"
        >
          <div className="flex items-center gap-2">
            <Badge
              variant={post.status === "published" ? "default" : "secondary"}
            >
              {post.status === "published"
                ? "Published"
                : post.status === "scheduled"
                  ? "Scheduled"
                  : "Draft"}
            </Badge>
            {post.publishedAt ? (
              <span className="text-xs text-muted-foreground">
                {new Date(post.publishedAt).toLocaleDateString("en")}
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="post-category">Category</Label>
            <Select
              value={categoryId ?? NONE}
              onValueChange={(v) => {
                const next = v === NONE ? null : v;
                setCategoryId(next);
                schedule({ categoryId: next });
              }}
            >
              <SelectTrigger id="post-category" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No category</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: c.color }}
                    />
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <CoverField
            workspace={workspace}
            workspaceId={workspaceId}
            url={post.coverUrl}
            onSave={(cover) => save({ cover })}
          />

          <div className="flex flex-col gap-2">
            <Label htmlFor="post-visibility">Visibility</Label>
            <Select
              value={isPublic ? "public" : "private"}
              onValueChange={(v) => {
                setIsPublic(v === "public");
                schedule({ isPublic: v === "public" });
              }}
            >
              <SelectTrigger id="post-visibility" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="private">Private (team only)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Label className="flex items-center justify-between font-normal">
            Pin to the top
            <Switch
              checked={pinned}
              onCheckedChange={(v) => {
                setPinned(v);
                schedule({ pinned: v });
              }}
            />
          </Label>
          <Label className="flex items-center justify-between gap-3 font-normal">
            <span>
              Email subscribers when published
              <span className="block text-xs text-muted-foreground">
                Sent once. Editing later never re-sends.
              </span>
            </span>
            <Switch
              checked={emailSubscribers}
              disabled={!!post.emailedAt}
              onCheckedChange={(v) => {
                setEmailSubscribers(v);
                schedule({ emailSubscribers: v });
              }}
            />
          </Label>

          <ShippedCards
            workspace={workspace}
            cards={cards}
            onChange={saveCards}
          />

          <div className="flex flex-col gap-2 border-t pt-4">
            <Button variant="secondary" onClick={duplicate}>
              <Copy />
              Duplicate
            </Button>
            <Button variant="secondary" onClick={() => setConfirmDelete(true)}>
              <Trash2 />
              Delete post
            </Button>
          </div>
          {post.authorName ? (
            <p className="text-xs text-muted-foreground">
              Written by {post.authorName}
            </p>
          ) : null}
        </aside>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>
              It disappears from your public site. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                const result = await deleteUpdateAction({
                  workspace,
                  id: post.id,
                });
                if (!result.ok) return toast.error(result.error);
                toast.success("Post deleted.");
                router.push(base);
              }}
            >
              Delete post
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Optional cover image, uploaded like images in the post body. */
function CoverField({
  workspace: _workspace,
  workspaceId,
  url: initial,
  onSave,
}: {
  workspace: string;
  workspaceId: string;
  url: string | null;
  onSave: (key: string | null) => Promise<boolean>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (!(file.type in IMAGE_TYPES)) {
      return toast.error("Use a PNG, JPEG or WebP image.");
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return toast.error("Images must be 2 MB or smaller.");
    }
    setBusy(true);
    try {
      const form = await requestUploadAction({
        purpose: "card-image",
        workspaceId,
        contentType: file.type as ImageType,
        size: file.size,
      });
      if (!form.ok) throw new Error(form.error);
      const body = new FormData();
      for (const [k, v] of Object.entries(form.data.fields)) body.append(k, v);
      body.append("file", file); // must be the last field for S3
      const res = await fetch(form.data.url, { method: "POST", body });
      if (!res.ok) throw new Error("Upload failed. Try again.");
      const saved = await saveUploadAction({
        purpose: "card-image",
        workspaceId,
        key: form.data.key,
      });
      if (!saved.ok) throw new Error(saved.error);
      if (await onSave(form.data.key)) setUrl(saved.data.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Cover image</Label>
      {url ? (
        // biome-ignore lint/performance/noImgElement: user upload, any size
        <img
          src={url}
          alt=""
          className="aspect-[16/9] w-full rounded-md border object-cover"
        />
      ) : null}
      <input
        ref={input}
        type="file"
        hidden
        aria-label="Cover image file"
        accept={Object.keys(IMAGE_TYPES).join(",")}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <ImageUp />
          {busy ? "Uploading…" : url ? "Change" : "Add cover"}
        </Button>
        {url ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={async () => {
              if (await onSave(null)) setUrl(null);
            }}
          >
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Roadmap cards this post announces ("shipped"). */
function ShippedCards({
  workspace,
  cards,
  onChange,
}: {
  workspace: string;
  cards: ShippedCard[];
  onChange: (cards: ShippedCard[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<
    { id: string; title: string; completed: boolean }[]
  >([]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    const timer = setTimeout(async () => {
      const result = await searchCardsForUpdateAction({ workspace, q });
      if (live && result.ok) setResults(result.data);
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [open, q, workspace]);

  return (
    <div className="flex flex-col gap-2">
      <Label>Shipped cards</Label>
      {cards.length ? (
        <ul className="flex flex-col gap-1">
          {cards.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-sm"
            >
              <span className="min-w-0 flex-1 truncate">{c.title}</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                aria-label={`Remove ${c.title}`}
                onClick={() => onChange(cards.filter((x) => x.id !== c.id))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          Link the roadmap cards this post announces. People following ideas on
          them hear it shipped.
        </p>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="self-start">
            <Plus />
            Add card
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-2">
          <Input
            autoFocus
            aria-label="Search cards"
            placeholder="Search cards…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <ul className="mt-2 flex max-h-64 flex-col overflow-y-auto">
            {results
              .filter((r) => !cards.some((c) => c.id === r.id))
              .map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                    onClick={() => {
                      onChange([
                        ...cards,
                        {
                          id: r.id,
                          title: r.title,
                          completed: r.completed,
                          roadmap: "",
                        },
                      ]);
                      setOpen(false);
                      setQ("");
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">{r.title}</span>
                    {r.completed ? (
                      <Badge variant="secondary">Done</Badge>
                    ) : null}
                  </button>
                </li>
              ))}
            {!results.length ? (
              <li className="px-2 py-1.5 text-sm text-muted-foreground">
                No cards found.
              </li>
            ) : null}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
