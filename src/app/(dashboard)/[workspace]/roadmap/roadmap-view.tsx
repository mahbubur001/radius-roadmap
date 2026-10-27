"use client";

import { generateKeyBetween } from "fractional-indexing";
import { ExternalLink, Plus, Search, Settings2, Shapes } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  createCardAction,
  createRoadmapAction,
  moveCardAction,
  moveColumnAction,
} from "@/app/(dashboard)/_actions/roadmap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Board, type CardMove, type ColumnMove } from "./board";
import { CardDrawer } from "./card-drawer";
import { CategoriesDialog } from "./categories-dialog";
import { RoadmapSettingsDialog } from "./roadmap-settings-dialog";
import { type BoardCard, type BoardData, byPosition } from "./types";

const ALL = "all";
const NEW_ROADMAP = "__new";

/** Client-side position for an optimistic move; the server's value wins. */
function guessPosition(prev?: string, next?: string) {
  try {
    return generateKeyBetween(prev ?? null, next ?? null);
  } catch {
    return prev ? `${prev}V` : "a0";
  }
}

export function RoadmapView({
  data,
  initialCardId,
}: {
  data: BoardData;
  initialCardId?: string;
}) {
  const router = useRouter();
  const { workspace } = data;
  const [cards, setCards] = useState(data.cards);
  const [columns, setColumns] = useState(data.columns);
  const [categories, setCategories] = useState(data.categories);
  const [tags, setTags] = useState(data.tags);
  useEffect(() => setCards(data.cards), [data.cards]);
  useEffect(() => setColumns(data.columns), [data.columns]);
  useEffect(() => setCategories(data.categories), [data.categories]);
  useEffect(() => setTags(data.tags), [data.tags]);

  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState(ALL);
  const [tagId, setTagId] = useState(ALL);
  const [visibility, setVisibility] = useState(ALL);
  const [showCompleted, setShowCompleted] = useState(true);
  const [openCardId, setOpenCardId] = useState<string | null>(
    initialCardId ?? null,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return new Set(
      cards
        .filter(
          (c) =>
            (!needle ||
              c.title.toLowerCase().includes(needle) ||
              (c.publicTitle ?? "").toLowerCase().includes(needle) ||
              c.summaryText.toLowerCase().includes(needle)) &&
            (categoryId === ALL || c.categoryId === categoryId) &&
            (tagId === ALL || c.tagIds.includes(tagId)) &&
            (visibility === ALL || c.isPublic === (visibility === "public")) &&
            (showCompleted || !c.completed),
        )
        .map((c) => c.id),
    );
  }, [cards, q, categoryId, tagId, visibility, showCompleted]);

  // Keep ?card=<id> in the URL so a card can be linked and survives reload.
  const openCard = useCallback((id: string | null) => {
    setOpenCardId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("card", id);
    else url.searchParams.delete("card");
    window.history.replaceState(null, "", url);
  }, []);
  const closeCard = useCallback(() => openCard(null), [openCard]);

  const patchCard = useCallback((id: string, change: Partial<BoardCard>) => {
    setCards((all) => all.map((c) => (c.id === id ? { ...c, ...change } : c)));
  }, []);
  const removeCard = useCallback((id: string) => {
    setCards((all) => all.filter((c) => c.id !== id));
  }, []);

  async function moveCard(move: CardMove) {
    const before = cards;
    const position = (id: string | null) =>
      id ? cards.find((c) => c.id === id)?.position : undefined;
    const column = columns.find((c) => c.id === move.columnId);
    setCards((all) =>
      all.map((c) =>
        c.id === move.cardId
          ? {
              ...c,
              columnId: move.columnId,
              position: guessPosition(
                position(move.prevId),
                position(move.nextId),
              ),
            }
          : c,
      ),
    );
    const result = await moveCardAction({
      workspace,
      id: move.cardId,
      columnId: move.columnId,
      prevId: move.prevId,
      nextId: move.nextId,
    });
    if (!result.ok) {
      setCards(before);
      return toast.error(result.error);
    }
    patchCard(move.cardId, {
      position: result.data.position,
      completed: result.data.completed,
    });
    if (column?.isDone && result.data.completed) {
      toast.success(`Moved to ${column.name}: marked complete.`);
    }
  }

  async function moveColumn(move: ColumnMove) {
    const before = columns;
    const position = (id: string | null) =>
      id ? columns.find((c) => c.id === id)?.position : undefined;
    setColumns((all) =>
      all.map((c) =>
        c.id === move.columnId
          ? {
              ...c,
              position: guessPosition(
                position(move.prevId),
                position(move.nextId),
              ),
            }
          : c,
      ),
    );
    const result = await moveColumnAction({
      workspace,
      id: move.columnId,
      prevId: move.prevId,
      nextId: move.nextId,
    });
    if (!result.ok) {
      setColumns(before);
      return toast.error(result.error);
    }
    setColumns((all) =>
      all.map((c) =>
        c.id === move.columnId ? { ...c, position: result.data } : c,
      ),
    );
  }

  async function quickAdd(columnId: string, title: string) {
    const result = await createCardAction({
      workspace,
      roadmapId: data.roadmap.id,
      columnId,
      title,
    });
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    const column = columns.find((c) => c.id === columnId);
    setCards((all) => [
      ...all,
      {
        id: result.data.id,
        slug: result.data.slug,
        columnId,
        position: result.data.position,
        title,
        publicTitle: null,
        summaryText: "",
        categoryId: null,
        plannedFor: null,
        isPublic: true,
        completed: !!column?.isDone,
        votes: 0,
        tagIds: [],
        features: { done: 0, total: 0 },
      },
    ]);
    return true;
  }

  async function switchRoadmap(value: string) {
    if (value !== NEW_ROADMAP) {
      router.push(`/${workspace}/roadmap?r=${value}`);
      return;
    }
    const result = await createRoadmapAction({
      workspace,
      title: "New roadmap",
    });
    if (!result.ok) return toast.error(result.error);
    router.push(`/${workspace}/roadmap?r=${result.data.slug}`);
    setSettingsOpen(true);
  }

  const sortedColumns = [...columns].sort(byPosition);
  const firstColumn = sortedColumns.find((c) => !c.isDone) ?? sortedColumns[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {data.roadmaps.length > 1 || data.canManage ? (
          <Select value={data.roadmap.slug} onValueChange={switchRoadmap}>
            <SelectTrigger aria-label="Roadmap" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.roadmaps.map((r) => (
                <SelectItem key={r.id} value={r.slug}>
                  {r.title}
                </SelectItem>
              ))}
              {data.canManage ? (
                <>
                  <SelectSeparator />
                  <SelectItem value={NEW_ROADMAP}>
                    <Plus />
                    New roadmap
                  </SelectItem>
                </>
              ) : null}
            </SelectContent>
          </Select>
        ) : (
          <h2 className="text-lg font-semibold">
            {data.roadmap.internalTitle}
          </h2>
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search cards"
            placeholder="Search cards"
            className="w-56 pl-8"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger aria-label="Filter by category" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {tags.length ? (
          <Select value={tagId} onValueChange={setTagId}>
            <SelectTrigger aria-label="Filter by tag" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All tags</SelectItem>
              {tags.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <Select value={visibility} onValueChange={setVisibility}>
          <SelectTrigger aria-label="Filter by visibility" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Public + private</SelectItem>
            <SelectItem value="public">Public only</SelectItem>
            <SelectItem value="private">Private only</SelectItem>
          </SelectContent>
        </Select>

        <Label className="flex items-center gap-2 font-normal">
          <Switch checked={showCompleted} onCheckedChange={setShowCompleted} />
          Show completed
        </Label>

        <div className="ml-auto flex items-center gap-2">
          {data.canManage ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCategoriesOpen(true)}
              >
                <Shapes />
                Categories
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings2 />
                Edit roadmap
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/${workspace}/roadmap/import?r=${data.roadmap.slug}`}
                >
                  Import
                </Link>
              </Button>
            </>
          ) : null}
          <Button variant="outline" size="sm" asChild>
            <a href={data.publicUrl} target="_blank" rel="noreferrer">
              <ExternalLink />
              View public
            </a>
          </Button>
        </div>
      </div>

      {columns.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This roadmap has no columns. Add one under Edit roadmap.
        </p>
      ) : cards.length === 0 && firstColumn ? (
        <p className="text-sm text-muted-foreground">
          No cards yet. Use + on a column to add the first one.
        </p>
      ) : null}

      <Board
        columns={columns}
        cards={cards}
        visible={visible}
        categories={categories}
        canManage={data.canManage}
        onMoveCard={moveCard}
        onMoveColumn={moveColumn}
        onOpenCard={openCard}
        onQuickAdd={quickAdd}
      />

      <CardDrawer
        workspace={workspace}
        workspaceId={data.workspaceId}
        cardId={openCardId}
        publicUrl={data.publicUrl}
        categories={categories}
        tags={tags}
        onClose={closeCard}
        onChanged={patchCard}
        onRemoved={removeCard}
        onTagCreated={(tag) =>
          setTags((all) =>
            all.some((t) => t.id === tag.id)
              ? all
              : [...all, tag].sort((a, b) => a.name.localeCompare(b.name)),
          )
        }
      />

      {data.canManage ? (
        <>
          <RoadmapSettingsDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            workspace={workspace}
            roadmap={data.roadmap}
            columns={columns}
            publicUrl={data.publicUrl}
            onColumnsChange={setColumns}
          />
          <CategoriesDialog
            open={categoriesOpen}
            onOpenChange={setCategoriesOpen}
            workspace={workspace}
            categories={categories}
            tags={tags}
            onCategoriesChange={setCategories}
            onTagsChange={setTags}
          />
        </>
      ) : null}
    </div>
  );
}
