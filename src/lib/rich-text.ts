// Tiptap JSON → plain text / sanitized HTML. The renderer is an allow-list:
// unknown nodes render only their children, unknown marks are dropped, and
// every attribute is escaped. User HTML is never stored or echoed.

export type RichTextNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type?: string; attrs?: Record<string, unknown> }[];
  content?: RichTextNode[];
};

const BLOCKS = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "codeBlock",
  "listItem",
]);

export function isRichTextDoc(value: unknown): value is RichTextNode {
  return (
    !!value &&
    typeof value === "object" &&
    (value as RichTextNode).type === "doc"
  );
}

/** Plain text, blocks separated by newlines (for previews and search). */
export function richTextToPlain(doc: unknown): string {
  if (!isRichTextDoc(doc)) return "";
  const out: string[] = [];
  const walk = (node: RichTextNode) => {
    if (node.type === "text" && typeof node.text === "string") {
      out.push(node.text);
    } else if (node.type === "hardBreak") {
      out.push("\n");
    }
    for (const child of node.content ?? []) walk(child);
    if (node.type && BLOCKS.has(node.type)) out.push("\n");
  };
  walk(doc);
  return out
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** http(s), mailto, or a same-site path. Anything else is dropped. */
export function safeHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (/^(https?:|mailto:)/i.test(v)) return v;
  if (v.startsWith("/") && !v.startsWith("//") && !v.includes("\\")) return v;
  return null;
}

/** Images: https or our own file route only. */
export function safeImageSrc(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (/^https:\/\//i.test(v) || v.startsWith("/api/files/")) return v;
  return null;
}

function renderMarks(text: string, marks: RichTextNode["marks"]) {
  let html = escapeHtml(text);
  for (const mark of marks ?? []) {
    switch (mark.type) {
      case "bold":
        html = `<strong>${html}</strong>`;
        break;
      case "italic":
        html = `<em>${html}</em>`;
        break;
      case "underline":
        html = `<u>${html}</u>`;
        break;
      case "strike":
        html = `<s>${html}</s>`;
        break;
      case "code":
        html = `<code>${html}</code>`;
        break;
      case "link": {
        const href = safeHref(mark.attrs?.href);
        if (href) {
          html = `<a href="${escapeHtml(href)}" rel="nofollow ugc noopener" target="_blank">${html}</a>`;
        }
        break;
      }
    }
  }
  return html;
}

function renderNode(node: RichTextNode): string {
  const inner = () => (node.content ?? []).map(renderNode).join("");
  switch (node.type) {
    case "doc":
      return inner();
    case "text":
      return typeof node.text === "string"
        ? renderMarks(node.text, node.marks)
        : "";
    case "paragraph":
      return `<p>${inner()}</p>`;
    case "heading": {
      const level = Number(node.attrs?.level);
      const tag = level >= 2 && level <= 4 ? `h${level}` : "h3";
      return `<${tag}>${inner()}</${tag}>`;
    }
    case "bulletList":
      return `<ul>${inner()}</ul>`;
    case "orderedList":
      return `<ol>${inner()}</ol>`;
    case "listItem":
      return `<li>${inner()}</li>`;
    case "blockquote":
      return `<blockquote>${inner()}</blockquote>`;
    case "codeBlock":
      return `<pre><code>${inner()}</code></pre>`;
    case "hardBreak":
      return "<br>";
    case "horizontalRule":
      return "<hr>";
    case "image": {
      const src = safeImageSrc(node.attrs?.src);
      if (!src) return "";
      const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
      return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy">`;
    }
    default:
      return inner();
  }
}

export function renderRichText(doc: unknown): string {
  return isRichTextDoc(doc) ? renderNode(doc) : "";
}
