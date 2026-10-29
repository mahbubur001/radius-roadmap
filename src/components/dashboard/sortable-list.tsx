"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Where an item landed: its new neighbours (fractional ordering). */
export type SortMove = {
  id: string;
  prevId: string | null;
  nextId: string | null;
};

/**
 * A vertical list reordered by a drag handle (mouse, touch or keyboard).
 * `onMove` gets the new order and the moved item's neighbours.
 */
export function SortableList<T extends { id: string }>({
  items,
  label,
  itemLabel,
  className,
  renderItem,
  onMove,
}: {
  items: T[];
  /** Accessible name of the list. */
  label: string;
  /** Accessible name of an item's drag handle. */
  itemLabel: (item: T) => string;
  className?: string;
  renderItem: (item: T, handle: ReactNode) => ReactNode;
  onMove: (next: T[], move: SortMove) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from < 0 || to < 0) return;
    const next = arrayMove(items, from, to);
    onMove(next, {
      id: String(active.id),
      prevId: next[to - 1]?.id ?? null,
      nextId: next[to + 1]?.id ?? null,
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <ul aria-label={label} className={className}>
          {items.map((item) => (
            <SortableRow key={item.id} id={item.id} label={itemLabel(item)}>
              {(handle) => renderItem(item, handle)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: (handle: ReactNode) => ReactNode;
}) {
  const sortable = useSortable({ id });
  return (
    <li
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
      }}
      className={cn("relative", sortable.isDragging && "z-10 opacity-60")}
    >
      {children(
        <button
          type="button"
          aria-label={label}
          className="flex size-7 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted active:cursor-grabbing"
          {...sortable.attributes}
          {...sortable.listeners}
        >
          <GripVertical className="size-4" />
        </button>,
      )}
    </li>
  );
}
