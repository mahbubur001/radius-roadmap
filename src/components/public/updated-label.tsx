"use client";

import { useEffect, useState } from "react";

function label(iso: string) {
  const day = (d: Date) =>
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000;
  const days = day(new Date()) - day(new Date(iso));
  if (days <= 0) return "updated today";
  if (days === 1) return "updated yesterday";
  if (days < 30) return `updated ${days} days ago`;
  return `updated ${new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" })}`;
}

/** " · updated today" on the roadmap hero, in the visitor's own time zone. */
export function UpdatedLabel({ iso }: { iso: string | null }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => setText(iso ? label(iso) : null), [iso]);
  return text ? <> · {text}</> : null;
}
