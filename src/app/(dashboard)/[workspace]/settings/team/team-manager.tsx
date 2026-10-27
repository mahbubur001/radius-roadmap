"use client";

import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  cancelInvitationAction,
  changeRoleAction,
  leaveAccountAction,
  removeMemberAction,
  resendInvitationAction,
  setMemberWorkspacesAction,
  transferOwnershipAction,
} from "@/app/(dashboard)/_actions/team";
import { SettingsSection } from "@/components/dashboard/settings-section";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { initials } from "@/lib/initials";
import type { ActionResult } from "@/server/action";
import { InviteDialog, roleLabels } from "./invite-dialog";
import {
  WorkspaceChecklist,
  type WorkspaceOption,
} from "./workspace-checklist";

type Role = "owner" | "admin" | "member";

type Member = {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  imageUrl: string | null;
  role: Role;
  workspaceIds: string[];
};

type Invitation = {
  id: string;
  email: string;
  role: Role;
  workspaceIds: string[];
  expired: boolean;
};

type Confirm = {
  title: string;
  description: string;
  label: string;
  run: () => Promise<ActionResult<unknown>>;
  done: string;
  after?: () => void;
};

export function TeamManager({
  me,
  members,
  invitations,
  workspaces,
}: {
  me: { userId: string; role: Role };
  members: Member[];
  invitations: Invitation[];
  workspaces: WorkspaceOption[];
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [editing, setEditing] = useState<Member | null>(null);
  const isOwner = me.role === "owner";
  const canManage = me.role !== "member";
  const names = new Map(workspaces.map((w) => [w.id, w.name]));

  /** Owners can edit anyone; admins anyone but owners; never yourself here. */
  const canEdit = (m: Member) =>
    canManage && m.userId !== me.userId && (isOwner || m.role !== "owner");

  async function run(
    call: () => Promise<ActionResult<unknown>>,
    done: string,
    after?: () => void,
  ) {
    const result = await call();
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    toast.success(done);
    if (after) after();
    else router.refresh();
    return true;
  }

  function access(ids: string[]) {
    const list = ids.map((id) => names.get(id)).filter(Boolean);
    return list.length ? list.join(", ") : "No workspaces";
  }

  return (
    <>
      <SettingsSection
        title="Team members"
        description={
          canManage
            ? "Owners and admins see every workspace. Members see only the workspaces you give them."
            : "People in this account."
        }
      >
        {canManage ? (
          <div>
            <InviteDialog isOwner={isOwner} workspaces={workspaces} />
          </div>
        ) : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Workspaces</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.memberId} data-testid={`member-${m.email}`}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8">
                      {m.imageUrl ? (
                        <AvatarImage src={m.imageUrl} alt="" />
                      ) : null}
                      <AvatarFallback>{initials(m.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {m.name}
                        {m.userId === me.userId ? (
                          <span className="text-muted-foreground"> (you)</span>
                        ) : null}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {m.email}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {canEdit(m) ? (
                    <Select
                      value={m.role}
                      onValueChange={(role) =>
                        run(
                          () =>
                            changeRoleAction({
                              memberId: m.memberId,
                              role: role as Role,
                            }),
                          `${m.name} is now ${roleLabels[role as Role].toLowerCase()}.`,
                        )
                      }
                    >
                      <SelectTrigger
                        size="sm"
                        aria-label={`Role for ${m.name}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(isOwner
                          ? (["owner", "admin", "member"] as const)
                          : (["admin", "member"] as const)
                        ).map((r) => (
                          <SelectItem key={r} value={r}>
                            {roleLabels[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="secondary">{roleLabels[m.role]}</Badge>
                  )}
                </TableCell>
                <TableCell className="max-w-56 truncate text-sm text-muted-foreground">
                  {m.role === "member"
                    ? access(m.workspaceIds)
                    : "All workspaces"}
                </TableCell>
                <TableCell>
                  <MemberActions
                    member={m}
                    isSelf={m.userId === me.userId}
                    canEdit={canEdit(m)}
                    isOwner={isOwner}
                    onEditAccess={() => setEditing(m)}
                    onConfirm={setConfirm}
                    onLeft={() => {
                      router.push("/");
                      router.refresh();
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SettingsSection>

      {canManage && invitations.length ? (
        <SettingsSection title="Pending invitations">
          <Table>
            <TableBody>
              {invitations.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{roleLabels[i.role]}</Badge>
                    {i.expired ? (
                      <Badge variant="destructive" className="ml-2">
                        Expired
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="max-w-56 truncate text-sm text-muted-foreground">
                    {i.role === "member"
                      ? access(i.workspaceIds)
                      : "All workspaces"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        run(
                          () => resendInvitationAction({ invitationId: i.id }),
                          `Invitation re-sent to ${i.email}.`,
                        )
                      }
                    >
                      Resend
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        run(
                          () => cancelInvitationAction({ invitationId: i.id }),
                          "Invitation canceled.",
                        )
                      }
                    >
                      Cancel
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SettingsSection>
      ) : null}

      {editing ? (
        <AccessDialog
          member={editing}
          workspaces={workspaces}
          onClose={() => setEditing(null)}
          onSave={(ids) =>
            run(
              () =>
                setMemberWorkspacesAction({
                  memberId: editing.memberId,
                  workspaceIds: ids,
                }),
              "Workspace access saved.",
            ).then((ok) => ok && setEditing(null))
          }
        />
      ) : null}

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async (e) => {
                e.preventDefault();
                if (!confirm) return;
                if (await run(confirm.run, confirm.done, confirm.after))
                  setConfirm(null);
              }}
            >
              {confirm?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function MemberActions({
  member: m,
  isSelf,
  canEdit,
  isOwner,
  onEditAccess,
  onConfirm,
  onLeft,
}: {
  member: Member;
  isSelf: boolean;
  canEdit: boolean;
  isOwner: boolean;
  onEditAccess: () => void;
  onConfirm: (c: Confirm) => void;
  onLeft: () => void;
}) {
  if (!isSelf && !canEdit) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Actions for ${m.name}`}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canEdit && m.role === "member" ? (
          <DropdownMenuItem onSelect={onEditAccess}>
            Edit workspace access
          </DropdownMenuItem>
        ) : null}
        {canEdit && isOwner && m.role !== "owner" ? (
          <DropdownMenuItem
            onSelect={() =>
              onConfirm({
                title: `Make ${m.name} the owner?`,
                description: "They become an owner and you become an admin.",
                label: "Transfer ownership",
                run: () => transferOwnershipAction({ memberId: m.memberId }),
                done: "Ownership transferred.",
              })
            }
          >
            Transfer ownership
          </DropdownMenuItem>
        ) : null}
        {canEdit ? (
          <DropdownMenuItem
            variant="destructive"
            onSelect={() =>
              onConfirm({
                title: `Remove ${m.name}?`,
                description:
                  "They lose access to this account and all its workspaces.",
                label: "Remove",
                run: () => removeMemberAction({ memberId: m.memberId }),
                done: `${m.name} was removed.`,
              })
            }
          >
            Remove from account
          </DropdownMenuItem>
        ) : null}
        {isSelf ? (
          <DropdownMenuItem
            variant="destructive"
            onSelect={() =>
              onConfirm({
                title: "Leave this account?",
                description:
                  "You'll lose access until someone invites you again.",
                label: "Leave account",
                run: () => leaveAccountAction({}),
                done: "You left the account.",
                after: onLeft,
              })
            }
          >
            Leave account
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AccessDialog({
  member,
  workspaces,
  onClose,
  onSave,
}: {
  member: Member;
  workspaces: WorkspaceOption[];
  onClose: () => void;
  onSave: (ids: string[]) => Promise<unknown>;
}) {
  const [ids, setIds] = useState(member.workspaceIds);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Workspace access for {member.name}</DialogTitle>
        </DialogHeader>
        <WorkspaceChecklist
          workspaces={workspaces}
          value={ids}
          onChange={setIds}
        />
        <DialogFooter>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onSave(ids);
              setBusy(false);
            }}
          >
            {busy ? "Saving…" : "Save access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
