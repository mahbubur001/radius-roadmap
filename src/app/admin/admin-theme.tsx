// Operator console look (doc 30 step 9): the dashboard's "Signal" system in a
// control-room setting, always dark. Amber marks Pro and things ending soon,
// coral marks suspended; nothing else is coloured. Rendered by the admin
// layout only, so customers never load it; set on :root so dialogs and menus
// (portalled to <body>) get it too.

const CSS = `:root:has([data-platform-admin]){color-scheme:dark;--admin-ink:#0d0d0c;--admin-ink-soft:#1f1e1c;--admin-ink-line:rgb(255 255 255 / 0.06);--admin-ink-text:#8f8c86;--admin-canvas:#121211;--admin-pro:#f5b83d;--admin-warn:#f5b83d;--admin-danger:#ff7a59;--canvas:#0d0d0c;--background:#121211;--foreground:#ecebe6;--card:#171715;--card-foreground:#ecebe6;--popover:#1d1c1a;--popover-foreground:#ecebe6;--primary:#ecebe6;--primary-foreground:#121211;--secondary:#22211e;--secondary-foreground:#ecebe6;--muted:#1b1a18;--muted-foreground:#a6a39c;--faint:#6d6a64;--accent:#22211e;--accent-foreground:#ecebe6;--border:#242320;--input:#302f2b;--ring:#6d6a64;--destructive:#ff7a59;--radius:0.5rem;--sheet-shadow:0 0 0 1px rgb(255 255 255 / 0.05),0 12px 40px -16px rgb(0 0 0 / 0.7);--pop-shadow:0 0 0 1px rgb(255 255 255 / 0.08),0 30px 80px -20px rgb(0 0 0 / 0.9)}:root:has([data-platform-admin]),:root:has([data-platform-admin]) body{overflow:hidden;background:#0d0d0c}[data-platform-admin] main h1{font-family:var(--font-display);letter-spacing:-0.02em}`;

export function AdminTheme() {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: constant CSS
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}
