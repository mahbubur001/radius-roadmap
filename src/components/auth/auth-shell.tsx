import type { ReactNode } from "react";

/**
 * Sign-in, sign-up, onboarding and other account pages: the dashboard's
 * canvas and type (doc 30), the Radius mark above a centred card.
 */
export function AuthShell({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <main
      data-app-shell=""
      className="flex flex-1 flex-col items-center justify-center gap-6 bg-canvas p-4"
    >
      <span className="flex items-center gap-2.5 text-foreground">
        <span className="grid size-8 place-items-center rounded-[9px] bg-foreground text-background">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-[18px]"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
          >
            <path d="M4 18a14 14 0 0 1 14-14" strokeWidth="2.4" />
            <path d="M8 18a10 10 0 0 1 10-10" strokeWidth="2.4" opacity=".6" />
            <circle cx="17" cy="17" r="2.2" fill="currentColor" stroke="none" />
          </svg>
        </span>
        <span className="font-display text-[15px] font-semibold tracking-[-0.01em]">
          Radius Roadmap
        </span>
      </span>
      <div className={wide ? "w-full max-w-md" : "w-full max-w-sm"}>
        {children}
      </div>
    </main>
  );
}
