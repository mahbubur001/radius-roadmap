// Tiny standalone HTML pages for links opened from emails (confirm,
// unsubscribe), rendered by route handlers. Every value is escaped.

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function simplePage(title: string, bodyHtml: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title><style>body{font-family:system-ui,sans-serif;background:#f4f4f5;margin:0;padding:48px 16px;color:#18181b}main{max-width:440px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 2px rgba(0,0,0,.06)}h1{font-size:20px;margin:0 0 12px}p{line-height:1.5;color:#52525b}button{background:#18181b;color:#fff;border:0;border-radius:8px;padding:10px 16px;font-size:15px;cursor:pointer}label{display:flex;gap:8px;align-items:center;margin:16px 0;color:#3f3f46;cursor:pointer}a{color:#2563eb}</style></head><body><main>${bodyHtml}</main></body></html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-frame-options": "DENY",
      },
    },
  );
}
