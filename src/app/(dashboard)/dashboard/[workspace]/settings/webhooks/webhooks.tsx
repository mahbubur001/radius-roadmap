"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  createEndpointAction,
  deleteEndpointAction,
  listDeliveriesAction,
  resendDeliveryAction,
  revealSecretAction,
  rotateSecretAction,
  setEndpointEnabledAction,
  testDeliveryAction,
  updateEndpointAction,
} from "@/app/(dashboard)/_actions/webhooks";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  WEBHOOK_EVENTS,
  type WebhookEndpointInput,
  type WebhookEvent,
  webhookEndpointSchema,
} from "@/lib/schemas/webhooks";

export type EndpointRow = {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  enabled: boolean;
  disabledReason: string | null;
  failingSince: string | null;
  createdAt: string;
};

type Delivery = {
  id: string;
  event: string;
  status: "pending" | "success" | "failed";
  attempts: number;
  responseStatus: number | null;
  responseSnippet: string | null;
  durationMs: number | null;
  createdAt: string;
};

const timeFormat = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** Settings → Webhooks: endpoints, secrets, test events, delivery log. */
export function Webhooks({
  workspace,
  locked,
  endpoints,
}: {
  workspace: string;
  locked: boolean;
  endpoints: EndpointRow[];
}) {
  const [editing, setEditing] = useState<EndpointRow | "new" | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <Button
        className="self-start"
        disabled={locked}
        onClick={() => setEditing("new")}
      >
        <Plus />
        Add webhook
      </Button>
      {endpoints.length ? (
        endpoints.map((e) => (
          <Endpoint
            key={e.id}
            workspace={workspace}
            endpoint={e}
            onEdit={() => setEditing(e)}
          />
        ))
      ) : (
        <p className="text-sm text-muted-foreground">No webhooks yet.</p>
      )}
      {editing ? (
        <EndpointDialog
          workspace={workspace}
          endpoint={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function EndpointDialog({
  workspace,
  endpoint,
  onClose,
}: {
  workspace: string;
  endpoint: EndpointRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const actionError = useActionError();
  const form = useForm<WebhookEndpointInput>({
    resolver: zodResolver(webhookEndpointSchema),
    defaultValues: {
      url: endpoint?.url ?? "",
      description: endpoint?.description ?? "",
      events: (endpoint?.events as WebhookEvent[]) ?? [],
    },
  });

  async function onSubmit(values: WebhookEndpointInput) {
    const result = endpoint
      ? await updateEndpointAction({ workspace, id: endpoint.id, ...values })
      : await createEndpointAction({ workspace, ...values });
    if (!result.ok) return actionError(result);
    toast.success(endpoint ? "Webhook saved." : "Webhook added.");
    router.refresh();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{endpoint ? "Edit webhook" : "Add webhook"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <TextField
              control={form.control}
              name="url"
              label="Endpoint URL"
              placeholder="https://example.com/radius-roadmap"
            />
            <TextField
              control={form.control}
              name="description"
              label="Description"
              placeholder="Optional"
            />
            <Controller
              control={form.control}
              name="events"
              render={({ field, fieldState }) => (
                <fieldset className="flex flex-col gap-3">
                  <FieldLabel asChild>
                    <legend>Events</legend>
                  </FieldLabel>
                  {Object.entries(WEBHOOK_EVENTS).map(([group, events]) => (
                    <div key={group} className="flex flex-col gap-1.5">
                      <p className="text-xs font-medium text-muted-foreground">
                        {group}
                      </p>
                      {events.map((event) => {
                        const checked = field.value.includes(event);
                        return (
                          <Label
                            key={event}
                            className="cursor-pointer font-normal"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(on) =>
                                field.onChange(
                                  on
                                    ? [...field.value, event]
                                    : field.value.filter((v) => v !== event),
                                )
                              }
                            />
                            <code className="text-xs">{event}</code>
                          </Label>
                        );
                      })}
                    </div>
                  ))}
                  {fieldState.error ? (
                    <FieldError>{fieldState.error.message}</FieldError>
                  ) : null}
                </fieldset>
              )}
            />
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {endpoint ? "Save" : "Add webhook"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Endpoint({
  workspace,
  endpoint,
  onEdit,
}: {
  workspace: string;
  endpoint: EndpointRow;
  onEdit: () => void;
}) {
  const router = useRouter();
  const actionError = useActionError();
  const [secret, setSecret] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[] | null>(null);

  async function run<T>(
    promise: Promise<
      { ok: true; data: T } | { ok: false; error: string; upgrade?: true }
    >,
    success?: string,
  ) {
    const result = await promise;
    if (!result.ok) {
      actionError(result);
      return null;
    }
    if (success) toast.success(success);
    return result;
  }

  async function loadDeliveries() {
    const result = await run(
      listDeliveriesAction({ workspace, id: endpoint.id }),
    );
    if (result) setDeliveries(result.data);
  }

  return (
    <section
      aria-label={endpoint.url}
      className="flex flex-col gap-3 rounded-md border p-4"
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <code className="truncate text-sm font-medium">{endpoint.url}</code>
          <span className="text-xs text-muted-foreground">
            {endpoint.description ? `${endpoint.description} · ` : ""}
            {endpoint.events.length} event
            {endpoint.events.length === 1 ? "" : "s"}
            {endpoint.failingSince && endpoint.enabled
              ? ` · failing since ${timeFormat.format(new Date(endpoint.failingSince))}`
              : ""}
          </span>
          {endpoint.disabledReason ? (
            <span className="text-xs text-destructive">
              {endpoint.disabledReason}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`on-${endpoint.id}`} className="text-xs">
            {endpoint.enabled ? "On" : "Off"}
          </Label>
          <Switch
            id={`on-${endpoint.id}`}
            aria-label="Webhook on"
            checked={endpoint.enabled}
            onCheckedChange={async (enabled) => {
              if (
                await run(
                  setEndpointEnabledAction({
                    workspace,
                    id: endpoint.id,
                    enabled,
                  }),
                )
              ) {
                router.refresh();
              }
            }}
          />
        </div>
      </div>

      {secret ? <CopyBlock label="Signing secret" value={secret} /> : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            const result = await run(
              revealSecretAction({ workspace, id: endpoint.id }),
            );
            if (result) setSecret(result.data);
          }}
        >
          <Eye />
          Signing secret
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm">
              <RefreshCw />
              Rotate secret
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Rotate the signing secret?</AlertDialogTitle>
              <AlertDialogDescription>
                Events are signed with the new secret right away. Update your
                receiver, or it will reject them.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  const result = await run(
                    rotateSecretAction({ workspace, id: endpoint.id }),
                    "Secret rotated.",
                  );
                  if (result) setSecret(result.data);
                }}
              >
                Rotate
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button
          variant="outline"
          size="sm"
          disabled={!endpoint.enabled}
          onClick={async () => {
            if (
              await run(
                testDeliveryAction({ workspace, id: endpoint.id }),
                "Test event queued.",
              )
            ) {
              setTimeout(() => void loadDeliveries(), 1500);
            }
          }}
        >
          <Send />
          Send test event
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadDeliveries()}
        >
          {deliveries ? "Refresh deliveries" : "Recent deliveries"}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm">
              <Trash2 />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this webhook?</AlertDialogTitle>
              <AlertDialogDescription>
                No more events go to {endpoint.url}. Its delivery log is deleted
                too.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (
                    await run(
                      deleteEndpointAction({ workspace, id: endpoint.id }),
                      "Webhook deleted.",
                    )
                  ) {
                    router.refresh();
                  }
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {deliveries ? (
        deliveries.length ? (
          <ul
            aria-label="Deliveries"
            className="flex flex-col divide-y text-sm"
          >
            {deliveries.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
              >
                <Badge
                  variant={
                    d.status === "success"
                      ? "secondary"
                      : d.status === "failed"
                        ? "destructive"
                        : "outline"
                  }
                >
                  {d.status === "success"
                    ? (d.responseStatus ?? "OK")
                    : d.status === "failed"
                      ? "Failed"
                      : "Retrying"}
                </Badge>
                <code className="text-xs">{d.event}</code>
                <span className="text-xs text-muted-foreground">
                  {timeFormat.format(new Date(d.createdAt))}
                  {d.attempts > 1 ? ` · ${d.attempts} tries` : ""}
                  {d.durationMs !== null ? ` · ${d.durationMs} ms` : ""}
                  {d.status !== "success" && d.responseSnippet
                    ? ` · ${d.responseSnippet.slice(0, 80)}`
                    : ""}
                </span>
                {d.status === "failed" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    onClick={async () => {
                      if (
                        await run(
                          resendDeliveryAction({ workspace, id: d.id }),
                          "Queued again.",
                        )
                      ) {
                        setTimeout(() => void loadDeliveries(), 1500);
                      }
                    }}
                  >
                    Resend
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No deliveries yet.</p>
        )
      ) : null}
    </section>
  );
}
