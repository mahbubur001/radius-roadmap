"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  createApiKeyAction,
  revokeApiKeyAction,
} from "@/app/(dashboard)/_actions/api-keys";
import { CopyBlock } from "@/components/dashboard/copy-block";
import { useActionError } from "@/components/dashboard/use-action-error";
import { TextField } from "@/components/form/text-field";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type CreateApiKeyInput,
  createApiKeySchema,
} from "@/lib/schemas/api-keys";

export type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  permission: "read" | "write";
  createdBy: string;
  createdAt: string;
  lastUsedAt: string | null;
};

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

/** Settings → API: create (shown once), list and revoke keys (doc 27). */
export function ApiKeys({
  workspace,
  locked,
  keys,
}: {
  workspace: string;
  /** The plan has no API access. */
  locked: boolean;
  keys: ApiKeyRow[];
}) {
  const router = useRouter();
  const actionError = useActionError();
  const [created, setCreated] = useState<string | null>(null);
  const form = useForm<CreateApiKeyInput>({
    resolver: zodResolver(createApiKeySchema),
    defaultValues: { name: "", permission: "read" },
  });

  async function onSubmit(values: CreateApiKeyInput) {
    const result = await createApiKeyAction({ workspace, ...values });
    if (!result.ok) return actionError(result);
    setCreated(result.data.key);
    form.reset({ name: "", permission: "read" });
    router.refresh();
  }

  async function revoke(id: string) {
    const result = await revokeApiKeyAction({ workspace, id });
    if (!result.ok) return actionError(result);
    toast.success("Key revoked.");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup className="sm:flex-row sm:items-end">
          <TextField
            control={form.control}
            name="name"
            label="Key name"
            placeholder="WordPress site"
            disabled={locked}
          />
          <Controller
            control={form.control}
            name="permission"
            render={({ field }) => (
              <Field className="sm:w-48">
                <FieldLabel htmlFor="api-permission">Access</FieldLabel>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={locked}
                >
                  <SelectTrigger id="api-permission">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="read">Read only</SelectItem>
                    <SelectItem value="write">Read and write</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}
          />
          <Button
            type="submit"
            className="self-start sm:self-end"
            disabled={locked || form.formState.isSubmitting}
          >
            <KeyRound />
            Create key
          </Button>
        </FieldGroup>
      </form>

      {keys.length ? (
        <ul className="flex flex-col divide-y rounded-md border">
          {keys.map((k) => (
            <li
              key={k.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2 font-medium">
                  {k.name}
                  <Badge variant="secondary">
                    {k.permission === "write" ? "Read and write" : "Read only"}
                  </Badge>
                </span>
                <span className="text-xs text-muted-foreground">
                  <code>{k.prefix}…</code> · by {k.createdBy} ·{" "}
                  {k.lastUsedAt
                    ? `last used ${dateFormat.format(new Date(k.lastUsedAt))}`
                    : "never used"}
                </span>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm">
                    Revoke
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Revoke “{k.name}”?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Anything using this key stops working right away. This
                      can't be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void revoke(k.id)}>
                      Revoke key
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No keys yet.</p>
      )}

      <Dialog open={!!created} onOpenChange={(o) => !o && setCreated(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your new API key</DialogTitle>
            <DialogDescription>
              Copy it now: it won't be shown again. Keep it secret, like a
              password.
            </DialogDescription>
          </DialogHeader>
          {created ? <CopyBlock label="API key" value={created} /> : null}
          <DialogFooter>
            <Button onClick={() => setCreated(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
