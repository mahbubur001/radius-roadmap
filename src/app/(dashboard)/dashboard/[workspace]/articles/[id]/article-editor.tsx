"use client";

import {
  ArrowLeft,
  Copy,
  ExternalLink,
  Send,
  Trash2,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  deleteArticleAction,
  duplicateArticleAction,
  patchArticleAction,
  publishArticleAction,
  unpublishArticleAction,
} from "@/app/(dashboard)/_actions/articles";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { PatchArticleInput } from "@/lib/schemas/articles";
import { ago } from "@/lib/time";
import type { ArticleDetail } from "@/server/services/articles";

type Patch = Omit<PatchArticleInput, "id">;
type CategoryOption = { id: string; name: string; icon: string };

const NONE = "none";

function when(value: Date | string) {
  return new Date(value).toLocaleDateString("en", { dateStyle: "medium" });
}

/** The article editor (doc 25 step 2): content left, settings rail right. */
export function ArticleEditor({
  workspace,
  workspaceId,
  publicBase,
  article,
  categories,
}: {
  workspace: string;
  workspaceId: string;
  /** Absolute URL of the public Articles page. */
  publicBase: string;
  article: ArticleDetail;
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const base = `/dashboard/${workspace}/articles`;
  const [title, setTitle] = useState(article.title);
  const [excerpt, setExcerpt] = useState(article.excerpt);
  const [categoryId, setCategoryId] = useState(article.categoryId);
  const [isPublic, setIsPublic] = useState(article.isPublic);
  const [featured, setFeatured] = useState(article.featured);
  const [status, setStatus] = useState(article.status);
  const [slug, setSlug] = useState(article.slug);
  const [publishedAt, setPublishedAt] = useState(article.publishedAt);
  const [updatedAt, setUpdatedAt] = useState(new Date(article.updatedAt));
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = useCallback(
    async (patch: Patch) => {
      const result = await patchArticleAction({
        workspace,
        id: article.id,
        ...patch,
      });
      if (!result.ok) toast.error(result.error);
      else setUpdatedAt(new Date(result.data.updatedAt));
      return result.ok;
    },
    [workspace, article.id],
  );
  const { schedule, flush, status: saveStatus } = useAutosave<Patch>(save);
  useEffect(() => () => void flush(), [flush]);

  async function publish() {
    setBusy(true);
    await flush();
    const result = await publishArticleAction({ workspace, id: article.id });
    setBusy(false);
    if (!result.ok) return toast.error(result.error);
    setStatus("published");
    setSlug(result.data.slug);
    setPublishedAt(
      result.data.publishedAt ? new Date(result.data.publishedAt) : null,
    );
    toast.success("Published.");
    router.refresh();
  }

  async function unpublish() {
    setBusy(true);
    const result = await unpublishArticleAction({ workspace, id: article.id });
    setBusy(false);
    if (!result.ok) return toast.error(result.error);
    setStatus("draft");
    toast.success("Moved back to drafts.");
    router.refresh();
  }

  async function duplicate() {
    await flush();
    const result = await duplicateArticleAction({ workspace, id: article.id });
    if (!result.ok) return toast.error(result.error);
    toast.success("Article duplicated.");
    router.push(`${base}/${result.data.id}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={status === "published" ? base : `${base}?tab=draft`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to articles
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
            label="Article"
            workspaceId={workspaceId}
            value={article.bodyJson as RichTextValue}
            onChange={(bodyJson) => schedule({ bodyJson })}
          />
          <p
            className="text-xs text-muted-foreground"
            aria-live="polite"
            suppressHydrationWarning
          >
            {autosaveLabel(saveStatus) || "All changes saved"} · Last updated{" "}
            {ago(updatedAt)}
            {article.updatedByName ? ` by ${article.updatedByName}` : ""}
          </p>
        </div>

        <aside
          aria-label="Article settings"
          className="flex w-full shrink-0 flex-col gap-5 rounded-lg border bg-muted/30 p-5 lg:w-80"
        >
          <section aria-label="Publishing" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant={status === "published" ? "default" : "secondary"}>
                {status === "published" ? "Published" : "Draft"}
              </Badge>
              {status === "published" && publishedAt ? when(publishedAt) : null}
            </div>
            {status === "published" ? (
              <>
                <Button variant="outline" asChild>
                  <a
                    href={`${publicBase}/${slug}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink />
                    View public article
                  </a>
                </Button>
                <Button variant="secondary" onClick={unpublish} disabled={busy}>
                  <Undo2 />
                  Unpublish
                </Button>
              </>
            ) : (
              <Button onClick={publish} disabled={busy}>
                <Send />
                {busy ? "Publishing…" : "Publish"}
              </Button>
            )}
          </section>

          <div className="flex flex-col gap-2">
            <Label htmlFor="article-category">Category</Label>
            <Select
              value={categoryId ?? NONE}
              onValueChange={(v) => {
                const next = v === NONE ? null : v;
                setCategoryId(next);
                schedule({ categoryId: next });
              }}
            >
              <SelectTrigger id="article-category" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Uncategorised</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span aria-hidden>{c.icon}</span>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="article-excerpt">Excerpt</Label>
            <Textarea
              id="article-excerpt"
              placeholder="Shown in lists and search results. Empty uses the first lines."
              maxLength={300}
              value={excerpt}
              onChange={(e) => {
                setExcerpt(e.target.value);
                schedule({ excerpt: e.target.value });
              }}
            />
          </div>

          <Label className="flex items-center justify-between gap-3 font-normal">
            <span>
              Featured
              <span className="block text-xs text-muted-foreground">
                Listed first on the public Articles page.
              </span>
            </span>
            <Switch
              checked={featured}
              onCheckedChange={(v) => {
                setFeatured(v);
                schedule({ featured: v });
              }}
            />
          </Label>
          <Label className="flex items-center justify-between gap-3 font-normal">
            <span>
              Public
              <span className="block text-xs text-muted-foreground">
                Off keeps it for your team only, even when published.
              </span>
            </span>
            <Switch
              checked={isPublic}
              onCheckedChange={(v) => {
                setIsPublic(v);
                schedule({ isPublic: v });
              }}
            />
          </Label>

          <div className="flex flex-col gap-2 border-t pt-4">
            <Button variant="secondary" onClick={duplicate}>
              <Copy />
              Duplicate
            </Button>
            <Button variant="secondary" onClick={() => setConfirmDelete(true)}>
              <Trash2 />
              Delete article
            </Button>
          </div>
        </aside>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this article?</AlertDialogTitle>
            <AlertDialogDescription>
              It disappears from your public site, with its ratings. This can't
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                const result = await deleteArticleAction({
                  workspace,
                  id: article.id,
                });
                if (!result.ok) return toast.error(result.error);
                toast.success("Article deleted.");
                router.push(base);
              }}
            >
              Delete article
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
