"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  createArticleCategoryAction,
  deleteArticleCategoryAction,
  editArticleCategoryAction,
  moveArticleCategoryAction,
} from "@/app/(dashboard)/_actions/articles";
import { SortableList } from "@/components/dashboard/sortable-list";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type ArticleCategoryOption = {
  id: string;
  name: string;
  description: string;
  icon: string;
  articles: number;
};

type Editable = Pick<ArticleCategoryOption, "name" | "description" | "icon">;

/** Article categories (doc 25 A5): icon, name, description, order. Admins. */
export function ArticleCategoriesDialog({
  open,
  onOpenChange,
  workspace,
  categories,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: string;
  categories: ArticleCategoryOption[];
  onChange: (categories: ArticleCategoryOption[]) => void;
}) {
  const [draft, setDraft] = useState<Editable>({
    name: "",
    description: "",
    icon: "📘",
  });

  async function add() {
    if (!draft.name.trim()) return;
    const result = await createArticleCategoryAction({ workspace, ...draft });
    if (!result.ok) return toast.error(result.error);
    onChange([
      ...categories,
      { id: result.data.id, ...draft, name: draft.name.trim(), articles: 0 },
    ]);
    setDraft({ name: "", description: "", icon: "📘" });
  }

  async function edit(
    category: ArticleCategoryOption,
    patch: Partial<Editable>,
  ) {
    const next = { ...category, ...patch };
    if (!next.name.trim() || !next.icon.trim()) return;
    onChange(categories.map((c) => (c.id === category.id ? next : c)));
    const result = await editArticleCategoryAction({
      workspace,
      id: next.id,
      name: next.name,
      description: next.description,
      icon: next.icon,
    });
    if (!result.ok) {
      toast.error(result.error);
      onChange(categories);
    }
  }

  async function remove(category: ArticleCategoryOption) {
    const result = await deleteArticleCategoryAction({
      workspace,
      id: category.id,
    });
    if (!result.ok) return toast.error(result.error);
    onChange(categories.filter((c) => c.id !== category.id));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Article categories</DialogTitle>
          <DialogDescription>
            Shown as cards on your public Articles page. Drag to reorder.
            Changes save right away; deleting a category keeps its articles,
            uncategorised.
          </DialogDescription>
        </DialogHeader>
        <SortableList
          items={categories}
          label="Categories in order"
          itemLabel={(c) => `Reorder ${c.name}`}
          className="flex flex-col gap-2"
          onMove={async (next, move) => {
            onChange(next);
            const result = await moveArticleCategoryAction({
              workspace,
              ...move,
            });
            if (!result.ok) {
              toast.error(result.error);
              onChange(categories);
            }
          }}
          renderItem={(c, handle) => (
            <div className="flex items-center gap-2">
              {handle}
              <Input
                aria-label={`Icon of ${c.name}`}
                defaultValue={c.icon}
                className="h-8 w-12 text-center"
                onBlur={(e) => {
                  const icon = e.target.value.trim();
                  if (icon && icon !== c.icon) void edit(c, { icon });
                }}
              />
              <Input
                aria-label="Category name"
                defaultValue={c.name}
                className="h-8 w-44"
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name && name !== c.name) void edit(c, { name });
                }}
              />
              <Input
                aria-label={`Description of ${c.name}`}
                defaultValue={c.description}
                placeholder="Description"
                className="h-8 flex-1"
                onBlur={(e) => {
                  const description = e.target.value.trim();
                  if (description !== c.description) {
                    void edit(c, { description });
                  }
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Delete category ${c.name}`}
                onClick={() => remove(c)}
              >
                <Trash2 />
              </Button>
            </div>
          )}
        />
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Input
            aria-label="New category icon"
            value={draft.icon}
            className="w-12 text-center"
            onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
          />
          <Input
            aria-label="New category"
            placeholder="New category"
            className="w-44"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <Input
            aria-label="New category description"
            placeholder="Description (optional)"
            className="min-w-40 flex-1"
            value={draft.description}
            onChange={(e) =>
              setDraft({ ...draft, description: e.target.value })
            }
          />
          <Button type="submit" variant="outline">
            Add
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
