"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  createCategoryAction,
  deleteCategoryAction,
  deleteTagAction,
  updateCategoryAction,
} from "@/app/(dashboard)/_actions/roadmap";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CategoryOption, TagOption } from "./types";

export function CategoriesDialog({
  open,
  onOpenChange,
  workspace,
  categories,
  tags,
  onCategoriesChange,
  onTagsChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: string;
  categories: CategoryOption[];
  tags: TagOption[];
  onCategoriesChange: (categories: CategoryOption[]) => void;
  onTagsChange: (tags: TagOption[]) => void;
}) {
  const [name, setName] = useState("");

  async function add() {
    const value = name.trim();
    if (!value) return;
    const color = SWATCHES[categories.length % SWATCHES.length] ?? "#2563eb";
    const result = await createCategoryAction({
      workspace,
      name: value,
      color,
    });
    if (!result.ok) return toast.error(result.error);
    onCategoriesChange([
      ...categories,
      { id: result.data.id, name: value, color },
    ]);
    setName("");
  }

  async function update(
    category: CategoryOption,
    patch: Partial<CategoryOption>,
  ) {
    const next = { ...category, ...patch };
    if (!next.name.trim()) return;
    onCategoriesChange(
      categories.map((c) => (c.id === category.id ? next : c)),
    );
    const result = await updateCategoryAction({ workspace, ...next });
    if (!result.ok) {
      toast.error(result.error);
      onCategoriesChange(categories);
    }
  }

  async function remove(category: CategoryOption) {
    const result = await deleteCategoryAction({ workspace, id: category.id });
    if (!result.ok) return toast.error(result.error);
    onCategoriesChange(categories.filter((c) => c.id !== category.id));
  }

  async function removeTag(tag: TagOption) {
    const result = await deleteTagAction({ workspace, id: tag.id });
    if (!result.ok) return toast.error(result.error);
    onTagsChange(tags.filter((t) => t.id !== tag.id));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Categories and tags</DialogTitle>
          <DialogDescription>
            Shared by every roadmap in this workspace. Changes save right away.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="categories">
          <TabsList>
            <TabsTrigger value="categories">Categories</TabsTrigger>
            <TabsTrigger value="tags">Tags</TabsTrigger>
          </TabsList>
          <TabsContent value="categories" className="flex flex-col gap-2 pt-2">
            <ul className="flex flex-col gap-2">
              {categories.map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <ColorPicker
                    label={`Colour of ${c.name}`}
                    value={c.color}
                    onChange={(color) => update(c, { color })}
                  />
                  <Input
                    aria-label="Category name"
                    defaultValue={c.name}
                    className="h-8"
                    onBlur={(e) => {
                      if (e.target.value.trim() !== c.name) {
                        void update(c, { name: e.target.value.trim() });
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
          </TabsContent>
          <TabsContent value="tags" className="pt-2">
            {tags.length ? (
              <ul className="flex flex-col gap-1">
                {tags.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between text-sm"
                  >
                    {t.name}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={`Delete tag ${t.name}`}
                      onClick={() => removeTag(t)}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Tags are created from a card's "Edit tags" menu.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
