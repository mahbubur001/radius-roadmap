"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  cancelCustomerInviteAction,
  endOverrideAction,
  resendCustomerInviteAction,
  setOverrideAction,
  suspendAction,
  unsuspendAction,
} from "@/app/admin/_actions";
import { DatePicker } from "@/components/form/date-picker";
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
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PLAN_IDS, PLANS } from "@/lib/plans";
import {
  type PlanOverrideInput,
  planOverrideSchema,
} from "@/lib/schemas/platform";

type Result = { ok: true } | { ok: false; error: string };

async function done(
  result: Result | { ok: true; data: unknown },
  router: ReturnType<typeof useRouter>,
  success: string,
) {
  if (!result.ok) {
    toast.error(result.error);
    return false;
  }
  toast.success(success);
  router.refresh();
  return true;
}

/** Grant or change a plan, with an optional end date (doc 28 C4). */
export function OverrideForm({
  accountId,
  current,
}: {
  accountId: string;
  current: { plan: string; endsOn: string; note: string } | null;
}) {
  const router = useRouter();
  const form = useForm<PlanOverrideInput>({
    resolver: zodResolver(planOverrideSchema),
    defaultValues: {
      accountId,
      plan: (current?.plan as PlanOverrideInput["plan"]) ?? "pro",
      endsOn: current?.endsOn ?? "",
      note: current?.note ?? "",
    },
  });

  return (
    <form
      onSubmit={form.handleSubmit(async (values) => {
        await done(await setOverrideAction(values), router, "Plan saved.");
      })}
      noValidate
    >
      <FieldGroup>
        <div className="flex flex-wrap gap-4">
          <Controller
            control={form.control}
            name="plan"
            render={({ field }) => (
              <Field className="w-44">
                <FieldLabel htmlFor="override-plan">Plan</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="override-plan">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLAN_IDS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PLANS[p].name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="endsOn"
            render={({ field }) => (
              <Field className="w-56">
                <FieldLabel htmlFor="override-ends">
                  Until (included)
                </FieldLabel>
                <DatePicker
                  id="override-ends"
                  value={field.value || null}
                  onChange={(v) => field.onChange(v ?? "")}
                  placeholder="No end date"
                />
              </Field>
            )}
          />
        </div>
        <TextField
          control={form.control}
          name="note"
          label="Note (only admins see it)"
          placeholder="Partner deal, trial, refund…"
        />
        <div className="flex gap-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {current ? "Update plan" : "Grant plan"}
          </Button>
          {current ? (
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                await done(
                  await endOverrideAction({ accountId }),
                  router,
                  "Granted plan ended.",
                );
              }}
            >
              End now
            </Button>
          ) : null}
        </div>
      </FieldGroup>
    </form>
  );
}

/** Suspend with a reason, or restore (doc 28 C8). */
export function SuspendControl({
  accountId,
  suspended,
}: {
  accountId: string;
  suspended: boolean;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  if (suspended) {
    return (
      <Button
        variant="outline"
        onClick={async () => {
          await done(
            await unsuspendAction({ accountId }),
            router,
            "Account restored.",
          );
        }}
      >
        Restore account
      </Button>
    );
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Suspend account</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Suspend this account?</AlertDialogTitle>
          <AlertDialogDescription>
            Its team loses the dashboard, its public site and widget show
            "unavailable", API keys stop, webhooks and subscriber emails pause.
            Nothing is deleted; you can restore it any time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="suspend-reason">Reason (kept in the audit log)</Label>
          <Input
            id="suspend-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Spam, unpaid invoice, owner asked…"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={reason.trim().length < 3}
            onClick={async () => {
              await done(
                await suspendAction({ accountId, reason }),
                router,
                "Account suspended.",
              );
            }}
          >
            Suspend
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Pending owner invitation: resend or cancel (doc 28 C3). */
export function OwnerInviteControls({
  accountId,
  email,
  empty,
}: {
  accountId: string;
  email: string;
  /** Nobody joined yet: cancelling deletes the account. */
  empty: boolean;
}) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          await done(
            await resendCustomerInviteAction({ accountId }),
            router,
            `Invitation sent again to ${email}.`,
          );
        }}
      >
        Resend invitation
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="sm">
            Cancel invitation
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel the invitation?</AlertDialogTitle>
            <AlertDialogDescription>
              {empty
                ? "Nobody has joined this account yet, so the account and its workspace are deleted too."
                : `${email} won't be able to join as owner.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const result = await cancelCustomerInviteAction({ accountId });
                if (!result.ok) return void toast.error(result.error);
                toast.success("Invitation cancelled.");
                if (result.data.accountDeleted) router.push("/admin/accounts");
                else router.refresh();
              }}
            >
              Cancel invitation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
