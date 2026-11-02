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
import { StageTick } from "@/components/dashboard/stage-tick";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cardStage, STAGE_COLORS, type Stage } from "@/lib/stages";
import { cn } from "@/lib/utils";
import { useBoardDisplay } from "./board-display";
import { ObjectivePicker } from "./objective-picker";
import {
  type BoardCard,
  type BoardColumn,
  byPosition,
  type ObjectiveOption,
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
  objectives,
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
  objectives: ObjectiveOption[];
  canManage: boolean;
  /** Show card summaries on the board. */
  summaryView: boolean;
  onMoveCard: (move: CardMove) => void;
  onMoveColumn: (move: ColumnMove) => void;
  onOpenCard: (id: string) => void;
  onQuickAdd: (columnId: string, title: string) => Promise<boolean>;
  onSetObjective: (cardId: string, objectiveId: string | null) => void;
  onCreateObjective?: (name: string) => Promise<ObjectiveOption | null>;
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
  const columnById = new Map(columns.map((c) => [c.id, c]));
  const stageOf = (card: BoardCard) =>
    cardStage({
      completed: card.completed,
      columnStage: columnById.get(card.columnId)?.stage ?? "planned",
      announced: card.announced,
    });

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
      <div className="flex gap-3 overflow-x-auto pb-4">
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
                    stage={stageOf(card)}
                    objectives={objectives}
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
            stage={stageOf(activeCard)}
            objective={objectives.find((c) => c.id === activeCard.objectiveId)}
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
        "flex w-[300px] shrink-0 flex-col rounded-xl bg-muted/70",
        sortable.isDragging && "opacity-50",
      )}
    >
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
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
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-[3px]"
          style={{
            background: STAGE_COLORS[column.isDone ? "shipped" : column.stage],
          }}
        />
        <h3 className="truncate text-[14px] font-semibold">{column.name}</h3>
        <span className="font-mono text-[11px] text-faint">{total}</span>
        {!column.isPublic ? (
          <EyeOff
            className="size-3.5 text-muted-foreground"
            aria-label="Hidden from the public roadmap"
          />
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-7"
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
        <div className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
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
  stage,
  objectives,
  summaryView,
  onOpen,
  onSetObjective,
  onCreateObjective,
}: {
  card: BoardCard;
  stage: Stage;
  objectives: ObjectiveOption[];
  summaryView: boolean;
  onOpen: (id: string) => void;
  onSetObjective: (cardId: string, objectiveId: string | null) => void;
  onCreateObjective?: (name: string) => Promise<ObjectiveOption | null>;
}) {
  const sortable = useSortable({ id: card.id });
  const { display } = useBoardDisplay();
  const image = display.showImageHeaders ? card.headerImageUrl : null;
  return (
    <div
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
      }}
      className={cn(sortable.isDragging && "opacity-40")}
    >
      {image ? (
        // biome-ignore lint/performance/noImgElement: user upload, served as-is
        <img
          src={image}
          alt=""
          loading="lazy"
          className="aspect-[3/1] w-full rounded-t-[10px] object-cover"
        />
      ) : null}
      <div className="relative">
        <button
          type="button"
          className="block w-full rounded-[10px] text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          {...sortable.attributes}
          {...sortable.listeners}
          aria-label={card.title}
          onClick={() => onOpen(card.id)}
        >
          <CardFace
            card={card}
            stage={stage}
            objective={objectives.find((c) => c.id === card.objectiveId)}
            summaryView={summaryView}
            objectiveSlot
            className={image ? "rounded-t-none" : undefined}
          />
        </button>
        {/* Outside the card's button: a button can't contain another one. */}
        {display.showObjectives ? (
          <ObjectivePicker
            objectives={objectives}
            value={card.objectiveId}
            onChange={(id) => onSetObjective(card.id, id)}
            onCreate={onCreateObjective}
            className="absolute top-2.5 left-3 max-w-[calc(100%-1.5rem)]"
          />
        ) : null}
      </div>
    </div>
  );
}

function CardFace({
  card,
  stage,
  objective,
  summaryView,
  objectiveSlot,
  className,
}: {
  card: BoardCard;
  stage: Stage;
  objective: ObjectiveOption | undefined;
  summaryView: boolean;
  /** Leave room for the objective picker drawn over the card. */
  objectiveSlot?: boolean;
  className?: string;
}) {
  const { display, tags } = useBoardDisplay();
  const { done, total } = card.features;
  const cardTags = display.showTags
    ? tags.filter((t) => card.tagIds.includes(t.id))
    : [];
  return (
    <article
      className={cn(
        "flex cursor-pointer flex-col gap-2.5 rounded-[10px] bg-card p-3 text-card-foreground shadow-[0_0_0_1px_var(--border),0_1px_2px_rgb(0_0_0/0.03)] transition-shadow hover:shadow-[0_0_0_1px_var(--input),0_8px_20px_-10px_rgb(0_0_0/0.18)]",
        className,
      )}
    >
      {!display.showObjectives ? null : objectiveSlot ? (
        <span className="h-4" />
      ) : (
        <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <span
            className="text-[8px]"
            style={{ color: objective?.color ?? "var(--faint)" }}
          >
            ◆
          </span>
          {objective?.name ?? "No objective"}
        </span>
      )}
      <p className="text-[13.5px] leading-snug font-medium">
        {card.completed ? (
          <CheckCircle2 className="mr-1 inline size-3.5 text-stage-shipped" />
        ) : null}
        {card.title}
      </p>
      {summaryView && display.showDescriptions && card.summaryText ? (
        <p className="line-clamp-3 text-xs text-muted-foreground">
          {card.summaryText}
        </p>
      ) : null}
      {cardTags.length ? (
        <ul className="flex flex-wrap gap-1" aria-label="Tags">
          {cardTags.map((t) => (
            <li
              key={t.id}
              className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
            >
              {t.name}
            </li>
          ))}
        </ul>
      ) : null}
      {display.showFeatureProgress && total > 0 ? (
        <div className="flex items-center gap-2 font-mono text-[11px] text-faint">
          <div className="h-1 flex-1 rounded-full bg-muted">
            <div
              className="h-1 rounded-full bg-stage-progress"
              style={{ width: `${Math.round((done / total) * 100)}%` }}
            />
          </div>
          {done}/{total}
        </div>
      ) : null}
      <div className="flex items-center gap-2.5 text-xs text-faint">
        <StageTick stage={stage} />
        {display.showDates && card.plannedFor ? (
          <span className="font-mono text-[11px]" title="Planned for">
            {formatPlanned(card.plannedFor)}
          </span>
        ) : null}
        {card.ideas ? (
          <span
            className="flex items-center gap-0.5"
            title={`${card.ideas} linked feedback`}
          >
            <Lightbulb className="size-3" />
            {card.ideas}
          </span>
        ) : null}
        {!card.isPublic ? (
          <Lock className="size-3" aria-label="Private card" />
        ) : null}
        {display.showVotes ? (
          <span
            className="ml-auto flex items-center gap-0.5 font-semibold text-foreground tabular-nums"
            title="Votes"
          >
            <ChevronUp className="size-3.5 text-faint" />
            {card.votes}
          </span>
        ) : null}
      </div>
    </article>
  );
}

function formatPlanned(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
