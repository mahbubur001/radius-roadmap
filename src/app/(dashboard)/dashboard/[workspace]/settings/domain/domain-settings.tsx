"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  removeDomainAction,
  setDomainAction,
  verifyDomainAction,
} from "@/app/(dashboard)/_actions/domains";
import { CopyBlock } from "@/components/dashboard/copy-block";
import { useActionError } from "@/components/dashboard/use-action-error";
import { ConfirmDelete } from "@/components/form/confirm-delete";
import { TextField } from "@/components/form/text-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { type DomainInput, domainSchema } from "@/lib/schemas/domain";

type Status = "pending" | "active" | "failed";

const STATUS: Record<Status, { label: string; hint: string }> = {
  pending: {
    label: "Waiting for DNS",
    hint: "Add both records at your DNS provider. We check every 10 minutes for 48 hours; DNS changes can take a while to spread.",
  },
  active: {
    label: "Live",
    hint: "Your public site is served here, and links to the old address redirect.",
  },
  failed: {
    label: "Not working",
    hint: "Fix the records below, then check again.",
  },
};

/** Settings → Domain (doc 26 6D): add, DNS records, verify, remove. */
export function DomainSettings({
  workspace,
  locked,
  domain,
}: {
  workspace: string;
  /** The plan has no custom domains. */
  locked: boolean;
  domain: {
    hostname: string;
    status: Status;
    error: string | null;
    url: string;
    records: {
      cname: { name: string; value: string };
      txt: { name: string; value: string };
    };
  } | null;
}) {
  const router = useRouter();
  const actionError = useActionError();
  const [checking, setChecking] = useState(false);
  const form = useForm<DomainInput>({
    resolver: zodResolver(domainSchema),
    defaultValues: { hostname: "" },
  });

  async function onSubmit(values: DomainInput) {
    const result = await setDomainAction({ workspace, ...values });
    if (!result.ok) return actionError(result);
    toast.success("Domain saved. Now add the DNS records.");
    form.reset({ hostname: "" });
    router.refresh();
  }

  async function verify() {
    setChecking(true);
    const result = await verifyDomainAction({ workspace });
    setChecking(false);
    if (!result.ok) return actionError(result);
    if (result.data?.status === "active") toast.success("Your domain is live.");
    else toast.error(result.data?.error ?? "Not ready yet.");
    router.refresh();
  }

  if (!domain) {
    return (
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <TextField
            control={form.control}
            name="hostname"
            label="Domain"
            placeholder="feedback.yourcompany.com"
            disabled={locked}
            autoComplete="off"
          />
          <Button
            type="submit"
            className="self-start"
            disabled={locked || form.formState.isSubmitting}
          >
            Add domain
          </Button>
        </FieldGroup>
      </form>
    );
  }

  const status = STATUS[domain.status];
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium">{domain.hostname}</span>
        <Badge
          variant={
            domain.status === "active"
              ? "default"
              : domain.status === "failed"
                ? "destructive"
                : "secondary"
          }
        >
          {status.label}
        </Badge>
        {domain.status === "active" ? (
          <Button variant="outline" size="sm" asChild>
            <a href={domain.url} target="_blank" rel="noreferrer">
              <ExternalLink />
              Open
            </a>
          </Button>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">{status.hint}</p>
      {domain.error && domain.status !== "active" ? (
        <p className="text-sm text-destructive">{domain.error}</p>
      ) : null}

      <div className="flex flex-col gap-4 rounded-md border p-4">
        <p className="text-sm font-medium">DNS records</p>
        <div className="grid gap-4 sm:grid-cols-[6rem_1fr]">
          <span className="text-sm text-muted-foreground">CNAME</span>
          <div className="flex flex-col gap-3">
            <CopyBlock label="Name" value={domain.records.cname.name} />
            <CopyBlock label="Points to" value={domain.records.cname.value} />
          </div>
          <span className="text-sm text-muted-foreground">TXT</span>
          <div className="flex flex-col gap-3">
            <CopyBlock label="TXT name" value={domain.records.txt.name} />
            <CopyBlock label="TXT value" value={domain.records.txt.value} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          The TXT record proves the domain is yours. Some DNS providers want
          only the first part of the name (without your domain at the end).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={verify}
          disabled={checking || locked}
        >
          <RefreshCw className={checking ? "animate-spin" : undefined} />
          {checking ? "Checking…" : "Check now"}
        </Button>
        <ConfirmDelete
          trigger="Remove domain"
          title="Remove this domain?"
          description="Your public site goes back to its Radius Roadmap address. Remove the DNS records at your provider afterwards."
          confirmText={domain.hostname}
          actionLabel="Remove domain"
          onConfirm={async () => {
            const result = await removeDomainAction({ workspace });
            if (!result.ok) {
              actionError(result);
              return false;
            }
            toast.success("Domain removed.");
            router.refresh();
            return true;
          }}
        />
      </div>
    </div>
  );
}
