const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "5 minutes ago", "3 hours ago", "2 days ago". */
export function ago(date: Date) {
  const minutes = Math.round((date.getTime() - Date.now()) / 60_000);
  if (minutes > -60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours > -24) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}
