"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { inviteAction } from "@/app/(dashboard)/_actions/team";
import { TextField } from "@/components/form/text-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { inviteSchema } from "@/lib/schemas/team";
import {
  WorkspaceChecklist,
  type WorkspaceOption,
} from "./workspace-checklist";

type Values = z.input<typeof inviteSchema>;

export const roleLabels = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
} as const;

export const roleHelp = {
  owner: "Full control, including billing and owners.",
  admin: "Manages settings, the team and every workspace.",
  member: "Works only in the workspaces you pick.",
} as const;

export function InviteDialog({
  isOwner,
  workspaces,
}: {
  isOwner: boolean;
  workspaces: WorkspaceOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const form = useForm<Values, unknown, z.output<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "member", workspaceIds: [] },
  });
  const role = form.watch("role");

  async function onSubmit(values: z.output<typeof inviteSchema>) {
    const result = await inviteAction(values);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Invitation sent to ${values.email}.`);
    form.reset();
    setOpen(false);
    router.refresh();
  }

  const roles = isOwner
    ? (["member", "admin", "owner"] as const)
    : (["member", "admin"] as const);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus />
          Invite teammate
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>Invite a teammate</DialogTitle>
            <DialogDescription>
              They&apos;ll get an email with a link to join. It expires in 7
              days.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-4">
            <TextField
              control={form.control}
              name="email"
              label="Email"
              type="email"
            />
            <Controller
              control={form.control}
              name="role"
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="invite-role">Role</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="invite-role" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((r) => (
                        <SelectItem key={r} value={r}>
                          {roleLabels[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    {roleHelp[field.value]}
                  </p>
                </Field>
              )}
            />
            {role === "member" ? (
              <Controller
                control={form.control}
                name="workspaceIds"
                render={({ field }) => (
                  <Field>
                    <FieldLabel>Workspace access</FieldLabel>
                    <WorkspaceChecklist
                      workspaces={workspaces}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </Field>
                )}
              />
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Sending…" : "Send invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
