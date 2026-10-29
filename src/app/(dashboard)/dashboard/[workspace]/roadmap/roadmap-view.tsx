"use client";

import { generateKeyBetween } from "fractional-indexing";
import {
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Filter,
  List,
  MoreVertical,
  Plus,
  Search,
  Settings2,
  Shapes,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  createCardAction,
  createCategoryAction,
  createRoadmapAction,
  moveCardAction,
  moveColumnAction,
  updateCardAction,
} from "@/app/(dashboard)/_actions/roadmap";
import { useStoredFlag } from "@/components/dashboard/use-stored-flag";
import { SWATCHES } from "@/components/form/color-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Board, type CardMove, type ColumnMove } from "./board";
import { CardDrawer } from "./card-drawer";
import { CategoriesDialog } from "./categories-dialog";
import {
  activeFilterCount,
  FiltersPanel,
  filtersFromParams,
  filtersToParams,
  matchesFilters,
  type RoadmapFilters,
} from "./filters-panel";
import { RoadmapSettingsDialog } from "./roadmap-settings-dialog";
import {
  type BoardCard,
  type BoardData,
  byPosition,
  type CategoryOption,
} from "./types";

/** Toolbar toggles: muted when off, outlined when on. */
const TOGGLE =
  "text-muted-foreground aria-pressed:text-foreground aria-pressed:ring-1 aria-pressed:ring-ring/60";

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

  const searchParams = useSearchParams();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<RoadmapFilters>(() =>
    filtersFromParams(searchParams),
  );
  const filterCount = activeFilterCount(filters);
  const [showFilters, setShowFilters] = useState(filterCount > 0);
  const [summaryView, setSummaryView] = useStoredFlag(
    "rr-roadmap-summary",
    true,
  );
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
            matchesFilters(c, filters),
        )
        .map((c) => c.id),
    );
  }, [cards, q, filters]);

  // Mirror the filters in the URL so a filtered board can be shared.
  useEffect(() => {
    const url = new URL(window.location.href);
    filtersToParams(filters, url.searchParams);
    window.history.replaceState(null, "", url);
  }, [filters]);

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

  async function setObjective(cardId: string, categoryId: string | null) {
    const before = cards.find((c) => c.id === cardId)?.categoryId ?? null;
    patchCard(cardId, { categoryId });
    const result = await updateCardAction({
      workspace,
      id: cardId,
      categoryId,
    });
    if (!result.ok) {
      patchCard(cardId, { categoryId: before });
      toast.error(result.error);
    }
  }

  const createObjective = useCallback(
    async (name: string): Promise<CategoryOption | null> => {
      const color = SWATCHES[categories.length % SWATCHES.length] ?? "#2563eb";
      const result = await createCategoryAction({ workspace, name, color });
      if (!result.ok) {
        toast.error(result.error);
        return null;
      }
      const created = { id: result.data.id, name, color };
      setCategories((all) => [...all, created]);
      return created;
    },
    [workspace, categories.length],
  );

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
        ideas: 0,
      },
    ]);
    return true;
  }

  async function newRoadmap() {
    const result = await createRoadmapAction({
      workspace,
      title: "New roadmap",
    });
    if (!result.ok) return toast.error(result.error);
    router.push(`/dashboard/${workspace}/roadmap?r=${result.data.slug}`);
    setSettingsOpen(true);
  }

  const sortedColumns = [...columns].sort(byPosition);
  const firstColumn = sortedColumns.find((c) => !c.isDone) ?? sortedColumns[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {data.roadmaps.length > 1 || data.canManage ? (
          <h1 className="text-xl font-semibold">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {data.roadmap.internalTitle}
                <ChevronDown className="size-4 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {data.roadmaps.map((r) => (
                  <DropdownMenuItem key={r.id} asChild>
                    <Link href={`/dashboard/${workspace}/roadmap?r=${r.slug}`}>
                      {r.title}
                    </Link>
                  </DropdownMenuItem>
                ))}
                {data.canManage ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={newRoadmap}>
                      <Plus />
                      New roadmap
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </h1>
        ) : (
          <h1 className="text-xl font-semibold">
            {data.roadmap.internalTitle}
          </h1>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            className={TOGGLE}
            aria-pressed={showFilters}
            onClick={() => setShowFilters((on) => !on)}
          >
            <Filter />
            Toggle filters
            {filterCount ? (
              <Badge variant="outline">{filterCount}</Badge>
            ) : null}
          </Button>
          <Button
            variant="secondary"
            className={TOGGLE}
            aria-pressed={filters.showCompleted}
            onClick={() =>
              setFilters((f) => ({ ...f, showCompleted: !f.showCompleted }))
            }
          >
            <CheckCircle2 />
            Completed cards
          </Button>
          {data.canManage ? (
            <Button variant="secondary" onClick={() => setSettingsOpen(true)}>
              <Settings2 />
              Edit roadmap
            </Button>
          ) : null}
          <Button
            variant="secondary"
            className={TOGGLE}
            aria-pressed={summaryView}
            onClick={() => setSummaryView(!summaryView)}
          >
            <List />
            Summary view
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary">
                More
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {data.canManage ? (
                <>
                  <DropdownMenuItem onSelect={() => setCategoriesOpen(true)}>
                    <Shapes />
                    Objectives and tags
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link
                      href={`/dashboard/${workspace}/roadmap/import?r=${data.roadmap.slug}`}
                    >
                      <Upload />
                      Import roadmap
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              ) : null}
              <DropdownMenuItem asChild>
                <a href={data.publicUrl} target="_blank" rel="noreferrer">
                  <ExternalLink />
                  View public roadmap
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex justify-end">
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search cards"
            placeholder="Search…"
            className="w-56 border-transparent bg-transparent pl-8 shadow-none focus-visible:border-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
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

      <div className="flex items-start gap-4">
        {showFilters ? (
          <FiltersPanel
            filters={filters}
            onChange={setFilters}
            objectives={categories}
            tags={tags}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <Board
            columns={columns}
            cards={cards}
            visible={visible}
            categories={categories}
            canManage={data.canManage}
            summaryView={summaryView}
            onMoveCard={moveCard}
            onMoveColumn={moveColumn}
            onOpenCard={openCard}
            onQuickAdd={quickAdd}
            onSetObjective={setObjective}
            onCreateObjective={data.canManage ? createObjective : undefined}
          />
        </div>
      </div>

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
