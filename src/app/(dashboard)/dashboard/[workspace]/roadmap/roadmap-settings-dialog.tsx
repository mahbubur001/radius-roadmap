"use client";

import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import {
  deleteRoadmapAction,
  saveRoadmapSettingsAction,
} from "@/app/(dashboard)/_actions/roadmap";
import { ConfirmDelete } from "@/components/form/confirm-delete";
import { RichTextEditor } from "@/components/form/rich-text-editor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RoadmapDisplaySettings } from "@/lib/schemas/roadmap";
import { type BoardColumn, type BoardRoadmap, byPosition } from "./types";

// The Edit roadmap modal (doc 24): everything is staged in local state and
// saved at once with "Save changes"; "Discard" goes back to what's saved.

type DisplayKey = keyof RoadmapDisplaySettings;

const GENERAL: { key: DisplayKey; label: string; hint: string }[] = [
  {
    key: "showTitle",
    label: "Title",
    hint: "Show the roadmap title above the board.",
  },
  {
    key: "showSummary",
    label: "Summary",
    hint: "Show the roadmap summary above the board.",
  },
  {
    key: "showTags",
    label: "Tags",
    hint: "Show tags on each card.",
  },
  {
    key: "showAttachments",
    label: "Attachments",
    hint: "Show the attachments of each card.",
  },
];

const CARDS: { key: DisplayKey; label: string; hint: string }[] = [
  { key: "showVotes", label: "Votes", hint: "Show votes on each card." },
  {
    key: "showObjectives",
    label: "Roadmap objectives",
    hint: "Show the objective on each card.",
  },
  {
    key: "showDescriptions",
    label: "Card details",
    hint: "Show the description of each card.",
  },
  {
    key: "showFeatures",
    label: "Features",
    hint: "Show the features list of each card.",
  },
  {
    key: "showFeatureProgress",
    label: "Feature progress",
    hint: "Show a progress bar of completed features.",
  },
  { key: "showDates", label: "Dates", hint: "Show planned-for dates." },
  {
    key: "showImageHeaders",
    label: "Image headers",
    hint: "Show each card's header image.",
  },
  {
    key: "showCompleted",
    label: "Completed cards",
    hint: "Show cards in done columns.",
  },
];

type ColumnDraft = {
  /** Stable React key; equals `id` for saved columns. */
  key: string;
  id?: string;
  name: string;
  isPublic: boolean;
  isDone: boolean;
};

export function RoadmapSettingsDialog({
  open,
  onOpenChange,
  ...props
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: string;
  workspaceId: string;
  roadmap: BoardRoadmap;
  columns: BoardColumn[];
  publicUrl: string;
  onColumnsChange: (columns: BoardColumn[]) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92svh] grid-cols-[minmax(0,1fr)] gap-0 overflow-y-auto bg-muted p-0 sm:max-w-4xl"
        showCloseButton={false}
      >
        {/* Unmounted while closed, so the form starts from saved values. */}
        <SettingsForm {...props} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function SettingsForm({
  workspace,
  workspaceId,
  roadmap,
  columns,
  publicUrl,
  onColumnsChange,
  onClose,
}: {
  workspace: string;
  workspaceId: string;
  roadmap: BoardRoadmap;
  columns: BoardColumn[];
  publicUrl: string;
  onColumnsChange: (columns: BoardColumn[]) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const initial = () => ({
    internalTitle: roadmap.internalTitle,
    publicTitle: roadmap.publicTitle ?? "",
    internalSummaryJson: roadmap.internalSummaryJson,
    publicSummaryJson: roadmap.publicSummaryJson,
    isPublic: roadmap.isPublic,
    notifyOnComplete: roadmap.notifyOnComplete,
    display: roadmap.display,
    internalDisplay: roadmap.internalDisplay,
    columns: [...columns].sort(byPosition).map(
      (c): ColumnDraft => ({
        key: c.id,
        id: c.id,
        name: c.name,
        isPublic: c.isPublic,
        isDone: c.isDone,
      }),
    ),
  });
  const [form, setForm] = useState(initial);
  // Bumped by Discard to remount the rich text editors with saved content.
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const roadmapUrl = `${publicUrl}?board=${roadmap.slug}`;
  const base = `/dashboard/${workspace}`;

  const setColumn = (key: string, patch: Partial<ColumnDraft>) =>
    setForm((f) => ({
      ...f,
      columns: f.columns.map((c) => (c.key === key ? { ...c, ...patch } : c)),
    }));

  const moveColumn = (index: number, by: -1 | 1) =>
    setForm((f) => {
      const next = [...f.columns];
      const [column] = next.splice(index, 1);
      if (column) next.splice(index + by, 0, column);
      return { ...f, columns: next };
    });

  const setDisplay = (
    side: "display" | "internalDisplay",
    key: DisplayKey,
    on: boolean,
  ) => setForm((f) => ({ ...f, [side]: { ...f[side], [key]: on } }));

  function discard() {
    setForm(initial());
    setVersion((v) => v + 1);
  }

  async function save() {
    setBusy(true);
    const result = await saveRoadmapSettingsAction({
      workspace,
      id: roadmap.id,
      ...form,
      columns: form.columns.map(({ id, name, isPublic, isDone }) => ({
        id,
        name,
        isPublic,
        isDone,
      })),
    });
    setBusy(false);
    if (!result.ok) return toast.error(result.error);
    onColumnsChange(result.data.columns);
    toast.success("Roadmap saved.");
    onClose();
    router.refresh();
  }

  const matrix = (
    rows: { key: DisplayKey; label: string; hint: string }[],
    title: string,
  ) => (
    <Section
      title={title}
      aside={
        <div className="grid w-40 grid-cols-2 text-center text-sm font-medium">
          <span>Internal</span>
          <span>Public</span>
        </div>
      }
    >
      <div className="divide-y">
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex items-center justify-between gap-4 py-3"
          >
            <div>
              <p className="text-sm font-medium">{row.label}</p>
              <p className="text-xs text-muted-foreground">{row.hint}</p>
            </div>
            <div className="grid w-40 shrink-0 grid-cols-2 justify-items-center">
              <Switch
                aria-label={`${row.label} (internal)`}
                checked={form.internalDisplay[row.key]}
                onCheckedChange={(on) =>
                  setDisplay("internalDisplay", row.key, on)
                }
              />
              <Switch
                aria-label={`${row.label} (public)`}
                checked={form.display[row.key]}
                onCheckedChange={(on) => setDisplay("display", row.key, on)}
              />
            </div>
          </div>
        ))}
      </div>
    </Section>
  );

  return (
    <>
      <header
        className="bg-sidebar px-8 pt-8 pb-14 text-sidebar-foreground"
        style={{ clipPath: "polygon(0 0, 100% 0, 100% 72%, 0 100%)" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <DialogTitle className="text-2xl font-semibold">
              Edit roadmap
            </DialogTitle>
            <DialogDescription className="text-sidebar-foreground/80">
              Internal settings are for your team; public ones for your public
              roadmap.
            </DialogDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-sidebar-foreground hover:bg-sidebar-foreground/15 hover:text-sidebar-foreground"
            aria-label="Close"
            onClick={onClose}
          >
            <span aria-hidden className="text-2xl leading-none">
              ×
            </span>
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-6 px-4 pb-6 sm:px-8">
        <Section title="General">
          <Tabs defaultValue="internal">
            <TabsList variant="line">
              <TabsTrigger value="internal">Internal title</TabsTrigger>
              <TabsTrigger value="public">Public title</TabsTrigger>
            </TabsList>
            <TabsContent value="internal">
              <Input
                aria-label="Internal title"
                value={form.internalTitle}
                onChange={(e) =>
                  setForm({ ...form, internalTitle: e.target.value })
                }
              />
            </TabsContent>
            <TabsContent value="public">
              <Input
                aria-label="Public title"
                placeholder={form.internalTitle}
                value={form.publicTitle}
                onChange={(e) =>
                  setForm({ ...form, publicTitle: e.target.value })
                }
              />
            </TabsContent>
          </Tabs>
          <Tabs defaultValue="internal" className="mt-4">
            <TabsList variant="line">
              <TabsTrigger value="internal">Internal summary</TabsTrigger>
              <TabsTrigger value="public">Public summary</TabsTrigger>
            </TabsList>
            <TabsContent value="internal">
              <RichTextEditor
                key={`internal-${version}`}
                label="Internal summary"
                workspaceId={workspaceId}
                value={form.internalSummaryJson}
                onChange={(internalSummaryJson) =>
                  setForm((f) => ({ ...f, internalSummaryJson }))
                }
              />
            </TabsContent>
            <TabsContent value="public">
              <RichTextEditor
                key={`public-${version}`}
                label="Public summary"
                workspaceId={workspaceId}
                value={form.publicSummaryJson}
                onChange={(publicSummaryJson) =>
                  setForm((f) => ({ ...f, publicSummaryJson }))
                }
              />
            </TabsContent>
          </Tabs>
        </Section>

        <Section title="Emails">
          <SwitchRow
            id="rm-notify"
            label="Email notifications"
            hint="When a card is completed, team members following it get an email. People following its linked ideas already hear when the idea's status changes."
            checked={form.notifyOnComplete}
            onChange={(notifyOnComplete) =>
              setForm({ ...form, notifyOnComplete })
            }
          />
        </Section>

        <Section title="Columns">
          <p className="mb-3 text-xs text-muted-foreground">
            Cards in a "Done" column count as completed. A column must be empty
            before you delete it.
          </p>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {form.columns.map((column, index) => (
              <div
                key={column.key}
                className="flex w-36 shrink-0 flex-col gap-3 rounded-md bg-muted p-3"
              >
                <Input
                  aria-label="Column name"
                  value={column.name}
                  className="bg-background"
                  onChange={(e) =>
                    setColumn(column.key, { name: e.target.value })
                  }
                />
                <ColumnSwitch
                  label="Public status"
                  checked={column.isPublic}
                  onChange={(isPublic) => setColumn(column.key, { isPublic })}
                />
                <ColumnSwitch
                  label="Done"
                  checked={column.isDone}
                  onChange={(isDone) => setColumn(column.key, { isDone })}
                />
                <div className="mt-auto flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`Move ${column.name} left`}
                    disabled={index === 0}
                    onClick={() => moveColumn(index, -1)}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-destructive hover:text-destructive"
                    aria-label={`Delete column ${column.name}`}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        columns: f.columns.filter((c) => c.key !== column.key),
                      }))
                    }
                  >
                    Delete <Trash2 />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`Move ${column.name} right`}
                    disabled={index === form.columns.length - 1}
                    onClick={() => moveColumn(index, 1)}
                  >
                    <ChevronRight />
                  </Button>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="flex min-h-40 w-36 shrink-0 items-center justify-center gap-1 rounded-md border border-dashed text-sm font-medium text-primary hover:bg-muted"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  columns: [
                    ...f.columns,
                    {
                      key: crypto.randomUUID(),
                      name: "New column",
                      isPublic: true,
                      isDone: false,
                    },
                  ],
                }))
              }
            >
              <Plus className="size-4" /> Add column
            </button>
          </div>
        </Section>

        <Section title="Public roadmap">
          <div className="divide-y">
            <SwitchRow
              id="rm-public"
              label="Public roadmap"
              hint={
                <>
                  When on, your public roadmap can be seen at{" "}
                  <a
                    className="font-medium text-primary underline-offset-2 hover:underline"
                    href={roadmapUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {roadmapUrl}
                  </a>
                </>
              }
              checked={form.isPublic}
              onChange={(isPublic) => setForm({ ...form, isPublic })}
            />
            <LinkRow
              label="Embed, logo, comments, follows and tab names"
              hint="These apply to the whole public site, so they live in the public site settings."
              href={`${base}/public-settings`}
              action="Public site settings"
            />
          </div>
        </Section>

        {matrix(GENERAL, "General")}
        {matrix(CARDS, "Roadmap cards")}

        <Section title="Board's feedback">
          <LinkRow
            label="Display feedback as public by default"
            hint={`Each feedback board decides this ("Publish without review" in its settings).`}
            href={`${base}/feedback`}
            action="Feedback boards"
          />
        </Section>

        <Section title="Danger zone">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Delete roadmap</p>
              <p className="text-xs text-muted-foreground">
                Deletes its columns, cards and votes for good.
              </p>
            </div>
            <ConfirmDelete
              trigger="Delete"
              title="Delete this roadmap?"
              description="Its columns, cards, features and votes are deleted for good."
              confirmText={roadmap.internalTitle}
              actionLabel="Delete roadmap"
              onConfirm={async () => {
                const result = await deleteRoadmapAction({
                  workspace,
                  id: roadmap.id,
                });
                if (!result.ok) {
                  toast.error(result.error);
                  return false;
                }
                toast.success("Roadmap deleted.");
                onClose();
                router.push(`${base}/roadmap`);
                router.refresh();
                return true;
              }}
            />
          </div>
        </Section>
      </div>

      <footer className="sticky bottom-0 flex justify-end gap-2 border-t bg-background px-4 py-3 sm:px-8">
        <Button variant="secondary" onClick={discard} disabled={busy}>
          Discard
        </Button>
        <Button onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </footer>
    </>
  );
}

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg bg-card p-5 shadow-sm ring-1 ring-border sm:p-6">
      <div className="mb-3 flex items-center justify-between gap-4 border-b pb-2">
        <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function SwitchRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: ReactNode;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <Label htmlFor={id}>{label}</Label>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function LinkRow({
  label,
  hint,
  href,
  action,
}: {
  label: string;
  hint: string;
  href: string;
  action: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </div>
      <Button variant="link" size="sm" asChild>
        <Link href={href}>
          {action} <ExternalLink />
        </Link>
      </Button>
    </div>
  );
}

function ColumnSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <Label className="flex flex-col items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
      {label}
      <Switch checked={checked} onCheckedChange={onChange} />
    </Label>
  );
}
