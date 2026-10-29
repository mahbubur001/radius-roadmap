import { Node } from "@tiptap/react";
import { VIDEO_ALLOW, videoEmbedUrl, videoRef } from "@/lib/video";

/**
 * YouTube / Vimeo embed in the rich text editor (doc 25 A7). Stores only
 * { provider, id }; the player URL is rebuilt from them here and in the
 * server renderer (src/lib/rich-text.ts).
 */
export const VideoNode = Node.create({
  name: "video",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      provider: { default: null },
      id: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-video-provider]",
        getAttrs: (el) => ({
          provider: el.getAttribute("data-video-provider"),
          id: el.getAttribute("data-video-id"),
        }),
      },
    ];
  },

  renderHTML({ node }) {
    const video = videoRef(node.attrs);
    if (!video) return ["div"];
    return [
      "div",
      {
        class: "video-embed",
        "data-video-provider": video.provider,
        "data-video-id": video.id,
      },
      [
        "iframe",
        {
          src: videoEmbedUrl(video),
          title: "Video",
          allow: VIDEO_ALLOW,
          allowfullscreen: "true",
          referrerpolicy: "strict-origin-when-cross-origin",
        },
      ],
    ];
  },
});
