"use client";

import { Download, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  exportSubscribersAction,
  removeSubscriberAction,
} from "@/app/(dashboard)/_actions/updates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { SubscriberRow } from "@/server/services/subscribers";

const LABELS = {
  active: "Active",
  pending: "Waiting for confirmation",
  unsubscribed: "Unsubscribed",
} as const;

export function SubscribersView({
  workspace,
  canManage,
  rows: initial,
  counts,
  status,
  query,
}: {
  workspace: string;
  canManage: boolean;
  rows: SubscriberRow[];
  counts: Partial<Record<keyof typeof LABELS, number>>;
  status: string;
  query: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);

  async function remove(id: string) {
    const result = await removeSubscriberAction({ workspace, id });
    if (!result.ok) return toast.error(result.error);
    setRows((all) => all.filter((r) => r.id !== id));
  }

  async function exportCsv() {
    const result = await exportSubscribersAction({ workspace });
    if (!result.ok) return toast.error(result.error);
    const url = URL.createObjectURL(
      new Blob([result.data.csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = result.data.filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Subscribers</h1>
        <p className="text-sm text-muted-foreground">
          People who get your published updates by email. They confirm their
          address first and can unsubscribe from any email.
        </p>
      </div>
      <div className="grid overflow-hidden rounded-xl border sm:grid-cols-3 [&>*+*]:border-t sm:[&>*+*]:border-t-0 sm:[&>*+*]:border-l">
        {(Object.keys(LABELS) as (keyof typeof LABELS)[]).map((k) => (
          <div key={k} className="flex flex-col gap-2 px-4 py-3.5">
            <p className="font-mono text-[11px] tracking-[0.08em] text-faint uppercase">
              {LABELS[k]}
            </p>
            <p className="font-display text-2xl leading-none font-semibold tabular-nums">
              {counts[k] ?? 0}
            </p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="flex flex-wrap items-center gap-2"
          aria-label="Filter subscribers"
        >
          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input
              type="search"
              name="q"
              defaultValue={query}
              aria-label="Search subscribers"
              placeholder="Search emails…"
              className="w-64 pl-8"
            />
          </div>
          <Select
            value={status || "all"}
            onValueChange={(v) => {
              const next = new URLSearchParams();
              if (query) next.set("q", query);
              if (v !== "all") next.set("status", v);
              const qs = next.toString();
              const base = `/dashboard/${workspace}/updates/subscribers`;
              router.push(qs ? `${base}?${qs}` : base);
            }}
          >
            <SelectTrigger aria-label="Status" className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(Object.keys(LABELS) as (keyof typeof LABELS)[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {status ? <input type="hidden" name="status" value={status} /> : null}
        </form>
        {canManage ? (
          <Button variant="secondary" className="ml-auto" onClick={exportCsv}>
            <Download />
            Export CSV
          </Button>
        ) : null}
      </div>
      {rows.length ? (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Since</TableHead>
                {canManage ? <TableHead className="w-12" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.email}</TableCell>
                  <TableCell>
                    <Badge
                      variant={r.status === "active" ? "default" : "secondary"}
                    >
                      {LABELS[r.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.source === "voter"
                      ? "Logged-in voter"
                      : r.source === "import"
                        ? "Import"
                        : "Public site"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString("en")}
                  </TableCell>
                  {canManage ? (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`Remove ${r.email}`}
                        onClick={() => remove(r.id)}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {query || status
            ? "No subscribers match."
            : "No subscribers yet. Visitors subscribe from your public Updates page."}
        </p>
      )}
    </div>
  );
}
