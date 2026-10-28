/*
 * Radius Roadmap embed (doc 19 §4.4). Paste on any page:
 *
 *   <script src="https://<app>/embed.js" data-account="<account-slug>"
 *     data-workspace="<workspace-slug>" async></script>
 *
 * Optional: data-board="<roadmap-slug>", data-min-height="600".
 * Inserts an iframe of the public roadmap right after the script tag and
 * grows it to fit its content, so the page never shows an inner scrollbar.
 */
(() => {
  const script = document.currentScript;
  if (!script?.src) return;
  const origin = new URL(script.src).origin;
  const { account, workspace } = script.dataset;
  if (!account || !workspace) {
    console.error(
      "[radius-roadmap] data-account and data-workspace are required",
    );
    return;
  }

  const url = new URL(
    `/${encodeURIComponent(account)}/${encodeURIComponent(workspace)}/roadmap`,
    origin,
  );
  url.searchParams.set("embed", "1");
  if (script.dataset.board) url.searchParams.set("board", script.dataset.board);

  const frame = document.createElement("iframe");
  frame.src = url.toString();
  frame.title = "Roadmap";
  frame.loading = "lazy";
  frame.setAttribute("scrolling", "no");
  frame.style.cssText = `display:block;width:100%;border:0;height:${Number(script.dataset.minHeight) || 600}px`;
  script.after(frame);

  window.addEventListener("message", (event) => {
    if (event.origin !== origin || event.source !== frame.contentWindow) return;
    const data = event.data;
    if (data?.type === "radius-roadmap:height" && Number(data.height) > 0) {
      frame.style.height = `${Math.ceil(data.height)}px`;
    }
  });
})();
