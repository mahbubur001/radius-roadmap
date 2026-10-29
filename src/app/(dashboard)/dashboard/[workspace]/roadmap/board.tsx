"use client";

import {
  type CollisionDetection,
  closestCenter,
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CheckCircle2,
  ChevronUp,
  EyeOff,
  GripVertical,
  Lightbulb,
  Lock,
  Plus,
} from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ObjectivePicker } from "./objective-picker";
import {
  type BoardCard,
  type BoardColumn,
  byPosition,
  type CategoryOption,
} from "./types";

const COLUMN_PREFIX = "col:";

/** Card ids per column id, in display order. */
export type Layout = Record<string, string[]>;

export type CardMove = {
  cardId: string;
  columnId: string;
  prevId: string | null;
  nextId: string | null;
};

export type ColumnMove = {
  columnId: string;
  prevId: string | null;
  nextId: string | null;
};

export function Board({
  columns,
  cards,
  visible,
  categories,
  canManage,
  summaryView,
  onMoveCard,
  onMoveColumn,
  onOpenCard,
  onQuickAdd,
  onSetObjective,
  onCreateObjective,
}: {
  columns: BoardColumn[];
  cards: BoardCard[];
  /** Ids that pass the current filters. */
  visible: Set<string>;
  categories: CategoryOption[];
  canManage: boolean;
  /** Show card summaries on the board. */
  summaryView: boolean;
  onMoveCard: (move: CardMove) => void;
  onMoveColumn: (move: ColumnMove) => void;
  onOpenCard: (id: string) => void;
  onQuickAdd: (columnId: string, title: string) => Promise<boolean>;
  onSetObjective: (cardId: string, categoryId: string | null) => void;
  onCreateObjective?: (name: string) => Promise<CategoryOption | null>;
}) {
  const sortedColumns = useMemo(() => [...columns].sort(byPosition), [columns]);
  const layoutFromProps = useMemo(() => {
    const layout: Layout = {};
    for (const c of sortedColumns) layout[c.id] = [];
    for (const card of [...cards].sort(byPosition)) {
      if (visible.has(card.id)) layout[card.columnId]?.push(card.id);
    }
    return layout;
  }, [sortedColumns, cards, visible]);

  // While dragging a card, the layout follows the pointer across columns.
  const [dragLayout, setDragLayout] = useState<Layout | null>(null);
  const [active, setActive] = useState<{
    type: "card" | "column";
    id: string;
  } | null>(null);
  const layout = dragLayout ?? layoutFromProps;
  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // Space picks a card up; Enter opens it (the card is a <button>).
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: {
        start: ["Space"],
        cancel: ["Escape"],
        end: ["Space", "Enter"],
      },
    }),
  );

  const collision: CollisionDetection = (args) => {
    if (active?.type === "column") {
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((d) =>
          String(d.id).startsWith(COLUMN_PREFIX),
        ),
      });
    }
    return closestCorners(args);
  };

  function columnOf(id: string, current: Layout) {
    if (id.startsWith(COLUMN_PREFIX)) return id.slice(COLUMN_PREFIX.length);
    return Object.keys(current).find((col) => current[col]?.includes(id));
  }

  function onDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    if (id.startsWith(COLUMN_PREFIX)) {
      setActive({ type: "column", id: id.slice(COLUMN_PREFIX.length) });
    } else {
      setActive({ type: "card", id });
      setDragLayout(layoutFromProps);
    }
  }

  function onDragOver(event: DragOverEvent) {
    if (active?.type !== "card" || !event.over) return;
    const activeId = String(event.active.id);
    const overId = String(event.over.id);
    setDragLayout((current) => {
      const base = current ?? layoutFromProps;
      const from = columnOf(activeId, base);
      const to = columnOf(overId, base);
      if (!from || !to || from === to) return base;
      const target = base[to] ?? [];
      const overIndex = overId.startsWith(COLUMN_PREFIX)
        ? target.length
        : target.indexOf(overId);
      return {
        ...base,
        [from]: (base[from] ?? []).filter((id) => id !== activeId),
        [to]: [
          ...target.slice(0, overIndex < 0 ? target.length : overIndex),
          activeId,
          ...target.slice(overIndex < 0 ? target.length : overIndex),
        ],
      };
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const was = active;
    setActive(null);
    const overId = event.over ? String(event.over.id) : null;

    if (was?.type === "column") {
      if (!overId) return;
      const ids = sortedColumns.map((c) => c.id);
      const from = ids.indexOf(was.id);
      const to = ids.indexOf(overId.slice(COLUMN_PREFIX.length));
      if (from < 0 || to < 0 || from === to) return;
      const next = arrayMove(ids, from, to);
      const i = next.indexOf(was.id);
      onMoveColumn({
        columnId: was.id,
        prevId: next[i - 1] ?? null,
        nextId: next[i + 1] ?? null,
      });
      return;
    }

    const current = dragLayout ?? layoutFromProps;
    setDragLayout(null);
    if (was?.type !== "card" || !overId) return;
    const column = columnOf(was.id, current);
    if (!column) return;
    let ids = current[column] ?? [];
    if (!overId.startsWith(COLUMN_PREFIX) && overId !== was.id) {
      const from = ids.indexOf(was.id);
      const to = ids.indexOf(overId);
      if (from >= 0 && to >= 0) ids = arrayMove(ids, from, to);
    }
    const i = ids.indexOf(was.id);
    const card = cardById.get(was.id);
    const before = layoutFromProps[card?.columnId ?? ""] ?? [];
    const unchanged =
      card?.columnId === column &&
      before.indexOf(was.id) === i &&
      before.length === ids.length;
    if (unchanged) return;
    onMoveCard({
      cardId: was.id,
      columnId: column,
      prevId: ids[i - 1] ?? null,
      nextId: ids[i + 1] ?? null,
    });
  }

  const activeCard = active?.type === "card" ? cardById.get(active.id) : null;

  return (
    <DndContext
      // Stable id: dnd-kit's own counter differs between server and client.
      id={dndId}
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActive(null);
        setDragLayout(null);
      }}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        <SortableContext
          items={sortedColumns.map((c) => `${COLUMN_PREFIX}${c.id}`)}
          strategy={horizontalListSortingStrategy}
        >
          {sortedColumns.map((column) => (
            <Column
              key={column.id}
              column={column}
              cardIds={layout[column.id] ?? []}
              total={cards.filter((c) => c.columnId === column.id).length}
              canManage={canManage}
              onQuickAdd={onQuickAdd}
            >
              {(layout[column.id] ?? []).map((id) => {
                const card = cardById.get(id);
                return card ? (
                  <SortableCard
                    key={id}
                    card={card}
                    categories={categories}
                    summaryView={summaryView}
                    onOpen={onOpenCard}
                    onSetObjective={onSetObjective}
                    onCreateObjective={onCreateObjective}
                  />
                ) : null;
              })}
            </Column>
          ))}
        </SortableContext>
      </div>
      <DragOverlay>
        {activeCard ? (
          <CardFace
            card={activeCard}
            category={categories.find((c) => c.id === activeCard.categoryId)}
            summaryView={summaryView}
            className="rotate-2 shadow-lg"
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  column,
  cardIds,
  total,
  canManage,
  onQuickAdd,
  children,
}: {
  column: BoardColumn;
  cardIds: string[];
  total: number;
  canManage: boolean;
  onQuickAdd: (columnId: string, title: string) => Promise<boolean>;
  children: React.ReactNode;
}) {
  const sortable = useSortable({
    id: `${COLUMN_PREFIX}${column.id}`,
    disabled: !canManage,
  });
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!title.trim()) return setAdding(false);
    setBusy(true);
    const ok = await onQuickAdd(column.id, title.trim());
    setBusy(false);
    if (ok) setTitle("");
  }

  return (
    <section
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
      }}
      aria-label={column.name}
      data-testid={`column-${column.name}`}
      className={cn(
        "flex w-80 shrink-0 flex-col rounded-lg border bg-muted/40",
        sortable.isDragging && "opacity-50",
      )}
    >
      <header className="flex items-center gap-1.5 px-3 pt-3 pb-2">
        {canManage ? (
          <button
            type="button"
            className="cursor-grab text-muted-foreground"
            aria-label={`Drag column ${column.name}`}
            {...sortable.attributes}
            {...sortable.listeners}
          >
            <GripVertical className="size-4" />
          </button>
        ) : null}
        <h3 className="text-base font-semibold">{column.name}</h3>
        <span className="text-xs text-muted-foreground">{total}</span>
        {!column.isPublic ? (
          <EyeOff
            className="size-3.5 text-muted-foreground"
            aria-label="Hidden from the public roadmap"
          />
        ) : null}
        <Button
          size="icon"
          className="ml-auto size-7 rounded-full"
          aria-label={`Add card to ${column.name}`}
          onClick={() => {
            setAdding(true);
            input.current?.focus();
          }}
        >
          <Plus />
        </Button>
      </header>
      <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-24 flex-1 flex-col gap-2.5 px-3 pb-3">
          {children}
          {adding ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void add();
              }}
            >
              <Input
                ref={input}
                autoFocus
                placeholder="Card title"
                aria-label="New card title"
                value={title}
                readOnly={busy}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => {
                  if (!title.trim()) setAdding(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setAdding(false);
                }}
              />
            </form>
          ) : null}
        </div>
      </SortableContext>
    </section>
  );
}

function SortableCard({
  card,
  categories,
  summaryView,
  onOpen,
  onSetObjective,
  onCreateObjective,
}: {
  card: BoardCard;
  categories: CategoryOption[];
  summaryView: boolean;
  onOpen: (id: string) => void;
  onSetObjective: (cardId: string, categoryId: string | null) => void;
  onCreateObjective?: (name: string) => Promise<CategoryOption | null>;
}) {
  const sortable = useSortable({ id: card.id });
  return (
    <div
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
      }}
      className={cn("relative", sortable.isDragging && "opacity-40")}
    >
      <button
        type="button"
        className="block w-full rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        {...sortable.attributes}
        {...sortable.listeners}
        aria-label={card.title}
        onClick={() => onOpen(card.id)}
      >
        <CardFace
          card={card}
          category={categories.find((c) => c.id === card.categoryId)}
          summaryView={summaryView}
          objectiveSlot
        />
      </button>
      {/* Outside the card's button: a button can't contain another one. */}
      <ObjectivePicker
        objectives={categories}
        value={card.categoryId}
        onChange={(id) => onSetObjective(card.id, id)}
        onCreate={onCreateObjective}
        className="absolute top-3 left-5 max-w-[calc(100%-2.5rem)]"
      />
    </div>
  );
}

function CardFace({
  card,
  category,
  summaryView,
  objectiveSlot,
  className,
}: {
  card: BoardCard;
  category: CategoryOption | undefined;
  summaryView: boolean;
  /** Leave room for the objective picker drawn over the card. */
  objectiveSlot?: boolean;
  className?: string;
}) {
  const { done, total } = card.features;
  return (
    <article
      className={cn(
        "flex cursor-pointer flex-col gap-2 rounded-md border border-l-4 bg-card py-3 pr-3 pl-4 text-card-foreground shadow-xs hover:border-ring",
        className,
      )}
      style={category ? { borderLeftColor: category.color } : undefined}
    >
      {objectiveSlot ? (
        <span className="h-4" />
      ) : (
        <span className="flex items-center gap-1.5 text-xs font-medium">
          {category ? (
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: category.color }}
            />
          ) : null}
          {category?.name ?? "No objective"}
        </span>
      )}
      <p className="font-semibold leading-snug">
        {card.completed ? (
          <CheckCircle2 className="mr-1 inline size-4 text-primary" />
        ) : null}
        {card.title}
      </p>
      {summaryView && card.summaryText ? (
        <p className="line-clamp-3 text-xs text-muted-foreground">
          {card.summaryText}
        </p>
      ) : null}
      {total > 0 ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-1 flex-1 rounded-full bg-muted">
            <div
              className="h-1 rounded-full bg-primary"
              style={{ width: `${Math.round((done / total) * 100)}%` }}
            />
          </div>
          {done}/{total}
        </div>
      ) : null}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span
          className="flex items-center gap-1 rounded border bg-background px-2 py-0.5 font-medium"
          title="Votes"
        >
          <ChevronUp className="size-3.5" />
          {card.votes}
        </span>
        {card.ideas ? (
          <span
            className="flex items-center gap-1"
            title={`${card.ideas} linked feedback`}
          >
            <Lightbulb className="size-3.5" />
            {card.ideas}
          </span>
        ) : null}
        {!card.isPublic ? (
          <Lock className="ml-auto size-3.5" aria-label="Private card" />
        ) : null}
      </div>
    </article>
  );
}
