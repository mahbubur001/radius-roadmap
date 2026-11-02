"use client";

import { ChevronRight } from "lucide-react";
import { useParams, usePathname } from "next/navigation";
import { Fragment } from "react";
import { SidebarToggle } from "./sidebar";

const SECTIONS: Record<string, string> = {
  feedback: "Feedback",
  roadmap: "Roadmap",
  updates: "Updates",
  articles: "Articles",
  settings: "Settings",
  "public-settings": "Public settings",
  widget: "Widget",
};

const PAGES: Record<string, string> = {
  inbox: "Inbox",
  comments: "Comments",
  subscribers: "Subscribers",
  profile: "Profile",
  workspace: "Workspace",
  notifications: "Notifications",
  account: "Account",
  branding: "Branding",
  domain: "Domain",
  team: "Team",
  api: "API keys",
  reference: "Reference",
  webhooks: "Webhooks",
  billing: "Billing",
};

/** Where you are, from the URL: "Acme › Feedback › Inbox". */
function useCrumbs() {
  const { workspace } = useParams<{ workspace: string }>();
  const parts = usePathname()
    .replace(`/dashboard/${workspace}`, "")
    .split("/")
    .filter(Boolean);
  const [section, ...rest] = parts;
  if (!section) return [{ key: "home", label: "Home" }];
  const crumbs = [{ key: section, label: SECTIONS[section] ?? section }];
  for (const part of rest) {
    const label =
      PAGES[part] ??
      (section === "updates" || section === "articles" ? "Editor" : null);
    if (label) crumbs.push({ key: `${section}/${part}`, label });
  }
  return crumbs;
}

/** The sheet's top bar: sidebar toggle and breadcrumbs. */
export function TopBar({ workspaceName }: { workspaceName: string }) {
  const crumbs = useCrumbs();
  return (
    <header className="flex h-12 shrink-0 items-center gap-2.5 border-b px-4">
      <SidebarToggle />
      <nav
        aria-label="Breadcrumb"
        className="flex min-w-0 items-center gap-1.5 text-[13px] text-faint"
      >
        <span className="truncate">{workspaceName}</span>
        {crumbs.map((c, i) => (
          <Fragment key={c.key}>
            <ChevronRight className="size-3 shrink-0" />
            <span
              className={
                i === crumbs.length - 1
                  ? "truncate font-medium text-foreground"
                  : "truncate"
              }
              aria-current={i === crumbs.length - 1 ? "page" : undefined}
            >
              {c.label}
            </span>
          </Fragment>
        ))}
      </nav>
    </header>
  );
}
