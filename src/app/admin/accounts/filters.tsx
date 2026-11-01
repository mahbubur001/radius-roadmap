"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ANY = "any";

/** Search + plan + status, kept in the URL. */
export function AccountFilters({
  q,
  plan,
  status,
  plans,
  statuses,
}: {
  q: string;
  plan: string;
  status: string;
  plans: { value: string; label: string }[];
  statuses: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [text, setText] = useState(q);
  const [planValue, setPlan] = useState(plan || ANY);
  const [statusValue, setStatus] = useState(status || ANY);

  function go(next: { q?: string; plan?: string; status?: string }) {
    const params = new URLSearchParams();
    const values = { q: text, plan: planValue, status: statusValue, ...next };
    if (values.q) params.set("q", values.q);
    if (values.plan !== ANY) params.set("plan", values.plan);
    if (values.status !== ANY) params.set("status", values.status);
    router.push(`/admin/accounts${params.size ? `?${params}` : ""}`);
  }

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        go({});
      }}
    >
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Name, URL or member email"
        aria-label="Search accounts"
        className="w-72"
      />
      <Select
        value={planValue}
        onValueChange={(v) => {
          setPlan(v);
          go({ plan: v });
        }}
      >
        <SelectTrigger aria-label="Plan" className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any plan</SelectItem>
          {plans.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={statusValue}
        onValueChange={(v) => {
          setStatus(v);
          go({ status: v });
        }}
      >
        <SelectTrigger aria-label="Status" className="w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any status</SelectItem>
          {statuses.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" variant="outline">
        Search
      </Button>
    </form>
  );
}
