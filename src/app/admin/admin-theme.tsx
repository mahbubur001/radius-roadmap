// Operator console look (doc 28): deep ink sidebar, cool canvas, one indigo
// accent; emerald / amber / rose only where they mean Pro / ending soon /
// suspended. Rendered by the admin layout only, so customers never load it;
// set on :root so dialogs and menus (portalled to <body>) get it too.

const CSS = `:root:has([data-platform-admin]){--admin-ink:oklch(0.2 0.035 270);--admin-ink-soft:oklch(0.27 0.04 270);--admin-ink-line:oklch(1 0 0 / 8%);--admin-ink-text:oklch(0.78 0.02 270);--admin-canvas:oklch(0.975 0.006 270);--admin-pro:oklch(0.6 0.13 163);--admin-warn:oklch(0.72 0.15 70);--admin-danger:oklch(0.6 0.2 18);--primary:oklch(0.51 0.23 277);--primary-foreground:oklch(0.985 0 0);--ring:oklch(0.58 0.2 277)}`;

export function AdminTheme() {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: constant CSS
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}
