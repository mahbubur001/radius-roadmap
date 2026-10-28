"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createWorkspaceAction } from "@/app/(dashboard)/_actions/workspaces";
import { TextField } from "@/components/form/text-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import {
  type CreateWorkspaceInput,
  createWorkspaceSchema,
  slugify,
} from "@/lib/schemas/workspace";

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const form = useForm<CreateWorkspaceInput>({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: { name: "", slug: "" },
  });

  // Fill the slug from the name until the user edits the slug themselves.
  function syncSlug(e: React.ChangeEvent<HTMLInputElement>) {
    const prev = slugify(form.getValues("name"));
    if (!form.getValues("slug") || form.getValues("slug") === prev) {
      form.setValue("slug", slugify(e.target.value));
    }
  }

  async function onSubmit(values: CreateWorkspaceInput) {
    const result = await createWorkspaceAction(values);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    onOpenChange(false);
    form.reset();
    router.push(`/dashboard/${result.data.slug}`);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>New workspace</DialogTitle>
            <DialogDescription>
              A workspace holds one product&apos;s feedback, roadmap, updates
              and articles.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-4">
            <TextField
              control={form.control}
              name="name"
              label="Product or project name"
              onChangeCapture={syncSlug}
            />
            <TextField
              control={form.control}
              name="slug"
              label="Workspace URL"
              description="Lowercase letters, numbers and dashes."
            />
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Creating…" : "Create workspace"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
