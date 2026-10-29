import { describe, expect, it } from "vitest";
import { renderRichText } from "./rich-text";
import { parseVideoUrl, videoRef } from "./video";

describe("parseVideoUrl", () => {
  it("reads YouTube and Vimeo links in their usual forms", () => {
    const yt = { provider: "youtube", id: "dQw4w9WgXcQ" };
    expect(
      parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=4"),
    ).toEqual(yt);
    expect(parseVideoUrl("youtu.be/dQw4w9WgXcQ")).toEqual(yt);
    expect(parseVideoUrl("https://youtube.com/shorts/dQw4w9WgXcQ")).toEqual(yt);
    expect(
      parseVideoUrl("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"),
    ).toEqual(yt);
    expect(parseVideoUrl("https://vimeo.com/76979871")).toEqual({
      provider: "vimeo",
      id: "76979871",
    });
    expect(parseVideoUrl("https://player.vimeo.com/video/76979871")).toEqual({
      provider: "vimeo",
      id: "76979871",
    });
  });

  it("rejects anything else", () => {
    expect(
      parseVideoUrl("https://evil.example/watch?v=dQw4w9WgXcQ"),
    ).toBeNull();
    expect(parseVideoUrl("https://youtube.com/watch?v=short")).toBeNull();
    expect(parseVideoUrl("javascript:alert(1)")).toBeNull();
    expect(parseVideoUrl("not a url")).toBeNull();
  });
});

describe("video in rich text", () => {
  const doc = (attrs: Record<string, unknown>) => ({
    type: "doc",
    content: [{ type: "video", attrs }],
  });

  it("renders a privacy-friendly player, or a link in emails", () => {
    const d = doc({ provider: "youtube", id: "dQw4w9WgXcQ" });
    expect(renderRichText(d)).toContain(
      'src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"',
    );
    expect(renderRichText(d, { email: true })).toBe(
      '<p><a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ">▶ Watch the video</a></p>',
    );
    expect(renderRichText(doc({ provider: "vimeo", id: "123" }))).toContain(
      'src="https://player.vimeo.com/video/123?dnt=1"',
    );
  });

  it("drops forged attributes", () => {
    expect(
      renderRichText(doc({ provider: "youtube", id: '"><script>x</script>' })),
    ).toBe("");
    expect(renderRichText(doc({ provider: "evil", id: "123" }))).toBe("");
    expect(videoRef({ src: "https://evil.example" })).toBeNull();
  });
});
