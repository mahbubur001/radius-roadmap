import { describe, expect, it } from "vitest";
import { plainToRichText, renderRichText, richTextToPlain } from "./rich-text";

const doc = (...content: unknown[]) => ({ type: "doc", content });
const p = (...content: unknown[]) => ({ type: "paragraph", content });
const text = (t: string, marks?: unknown[]) => ({
  type: "text",
  text: t,
  marks,
});

describe("renderRichText", () => {
  it("renders allowed nodes and marks", () => {
    expect(
      renderRichText(
        doc(
          { type: "heading", attrs: { level: 2 }, content: [text("Title")] },
          p(
            text("bold", [{ type: "bold" }]),
            text(" and "),
            text("it", [{ type: "italic" }]),
          ),
          {
            type: "bulletList",
            content: [{ type: "listItem", content: [p(text("one"))] }],
          },
        ),
      ),
    ).toBe(
      "<h2>Title</h2><p><strong>bold</strong> and <em>it</em></p><ul><li><p>one</p></li></ul>",
    );
  });

  it("escapes text and drops unknown nodes' tags", () => {
    expect(
      renderRichText(
        doc({ type: "script", content: [text("<img onerror=x>")] }),
      ),
    ).toBe("&lt;img onerror=x&gt;");
  });

  it("drops javascript: links and non-https images", () => {
    const html = renderRichText(
      doc(
        p(
          text("click", [
            { type: "link", attrs: { href: "javascript:alert(1)" } },
          ]),
        ),
        { type: "image", attrs: { src: "http://evil.test/x.png" } },
        { type: "image", attrs: { src: "/api/files/a/b.png", alt: '"><x' } },
        p(
          text("ok", [
            { type: "link", attrs: { href: "https://radiustheme.com" } },
          ]),
        ),
      ),
    );
    expect(html).not.toContain("javascript");
    expect(html).not.toContain("evil.test");
    expect(html).toContain(
      '<img src="/api/files/a/b.png" alt="&quot;&gt;&lt;x"',
    );
    expect(html).toContain(
      '<a href="https://radiustheme.com" rel="nofollow ugc noopener" target="_blank">ok</a>',
    );
  });

  it("returns empty for anything that isn't a doc", () => {
    expect(renderRichText("<b>x</b>")).toBe("");
    expect(renderRichText(null)).toBe("");
  });
});

describe("richTextToPlain", () => {
  it("joins blocks with newlines", () => {
    expect(richTextToPlain(doc(p(text("One")), p(text("Two"))))).toBe(
      "One\nTwo",
    );
  });
});

describe("plainToRichText", () => {
  it("keeps text as plain paragraphs and breaks, escaped when rendered", () => {
    const doc = plainToRichText("Line one\nline two\n\n<b>Second</b>");
    expect(richTextToPlain(doc)).toBe("Line one\nline two\n<b>Second</b>");
    expect(renderRichText(doc)).toBe(
      "<p>Line one<br>line two</p><p>&lt;b&gt;Second&lt;/b&gt;</p>",
    );
  });
});
