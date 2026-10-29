"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  createUpdateCategoryAction,
  deleteUpdateCategoryAction,
  editUpdateCategoryAction,
} from "@/app/(dashboard)/_actions/updates";
import { ColorPicker, SWATCHES } from "@/components/form/color-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type CategoryOption = { id: string; name: string; color: string };

/** Update categories (doc 23): coloured labels for posts. Admins only. */
export function CategoriesDialog({
  open,
  onOpenChange,
  workspace,
  categories,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: string;
  categories: CategoryOption[];
  onChange: (categories: CategoryOption[]) => void;
}) {
  const [name, setName] = useState("");

  async function add() {
    const value = name.trim();
    if (!value) return;
    const color = SWATCHES[categories.length % SWATCHES.length] ?? "#2563eb";
    const result = await createUpdateCategoryAction({
      workspace,
      name: value,
      color,
    });
    if (!result.ok) return toast.error(result.error);
    onChange([...categories, { id: result.data.id, name: value, color }]);
    setName("");
  }

  async function edit(
    category: CategoryOption,
    patch: Partial<CategoryOption>,
  ) {
    const next = { ...category, ...patch };
    if (!next.name.trim()) return;
    onChange(categories.map((c) => (c.id === category.id ? next : c)));
    const result = await editUpdateCategoryAction({ workspace, ...next });
    if (!result.ok) {
      toast.error(result.error);
      onChange(categories);
    }
  }

  async function remove(category: CategoryOption) {
    const result = await deleteUpdateCategoryAction({
      workspace,
      id: category.id,
    });
    if (!result.ok) return toast.error(result.error);
    onChange(categories.filter((c) => c.id !== category.id));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update categories</DialogTitle>
          <DialogDescription>
            Labels for your posts, shown on the public Updates page. Changes
            save right away.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <ColorPicker
                label={`Colour of ${c.name}`}
                value={c.color}
                onChange={(color) => edit(c, { color })}
              />
              <Input
                aria-label="Category name"
                defaultValue={c.name}
                className="h-8"
                onBlur={(e) => {
                  if (e.target.value.trim() !== c.name) {
                    void edit(c, { name: e.target.value.trim() });
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
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Input
            aria-label="New category"
            placeholder="New category"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" variant="outline">
            Add
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
