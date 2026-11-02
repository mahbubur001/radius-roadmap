import type { ReactNode } from "react";

/** Titled block used on every settings page. */
export function SettingsSection({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-6">
      <div>
        <h3 className="flex items-center gap-2 font-display text-[15px] font-semibold">
          {title}
        </h3>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
