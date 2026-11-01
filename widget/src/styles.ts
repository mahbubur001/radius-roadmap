// Shadow DOM styles: the host site's CSS can't reach in, ours can't leak out.
export const styles = `
:host { all: initial; }
.rr { --rr-accent: #4f46e5; --rr-on-accent: #fff; --rr-text: #0f172a; --rr-muted: #64748b; --rr-line: #e2e8f0;
  font: 14px/1.5 var(--rr-font, system-ui, -apple-system, "Segoe UI", sans-serif); color: var(--rr-text); }
.rr * { box-sizing: border-box; font: inherit; }
.rr button { cursor: pointer; }
.launcher { position: fixed; bottom: 20px; z-index: 2147483000; width: 52px; height: 52px;
  display: grid; place-items: center; border: 0; border-radius: 50%; color: var(--rr-on-accent);
  background: var(--rr-accent); box-shadow: 0 6px 20px rgba(15,23,42,.25); }
.right .launcher { right: 20px; } .left .launcher { left: 20px; }
.badge { position: absolute; top: -2px; right: -2px; min-width: 20px; height: 20px; padding: 0 5px;
  border-radius: 10px; background: #ef4444; color: #fff; font-size: 11px; font-weight: 700;
  line-height: 20px; text-align: center; box-shadow: 0 0 0 2px #fff; }
.backdrop { position: fixed; inset: 0; z-index: 2147483001; border: 0; padding: 0; background: rgba(15,23,42,.3); cursor: default; }
.panel { position: fixed; z-index: 2147483002; display: flex; flex-direction: column;
  background: #fff; box-shadow: 0 20px 50px rgba(15,23,42,.25); outline: none; overflow: hidden; }
.sidebar .panel { top: 0; bottom: 0; width: 400px; max-width: 100vw; }
.sidebar.right .panel { right: 0; } .sidebar.left .panel { left: 0; }
.popover .panel { bottom: 84px; width: 380px; height: min(560px, calc(100vh - 110px));
  max-width: calc(100vw - 40px); border-radius: 14px; }
.popover.right .panel { right: 20px; } .popover.left .panel { left: 20px; }
header { display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 14px 18px; background: var(--rr-accent); color: var(--rr-on-accent); }
.rr header strong { font-size: 16px; font-weight: 600; }
header button { border: 0; background: none; color: inherit; }
.close { font-size: 24px; line-height: 1; padding: 0 4px; opacity: .9; }
.back { font-weight: 500; padding: 0; }
.body { flex: 1; overflow-y: auto; }
footer { padding: 12px 18px; border-top: 1px solid var(--rr-line); }
.primary { width: 100%; padding: 9px 14px; border: 0; border-radius: 8px; background: var(--rr-accent);
  color: var(--rr-on-accent); font-weight: 600; }
.primary:disabled { opacity: .6; cursor: default; }
.powered { display: block; padding: 6px; text-align: center; font-size: 11px; color: var(--rr-muted);
  text-decoration: none; }
.empty { padding: 32px 18px; text-align: center; color: var(--rr-muted); }
.posts { list-style: none; margin: 0; padding: 0; }
.posts li { padding: 16px 18px; border-bottom: 1px solid var(--rr-line); }
.meta { display: flex; align-items: center; gap: 8px; color: var(--rr-muted); font-size: 12px; }
.chip { display: inline-flex; align-items: center; gap: 5px; padding: 1px 7px; border: 1px solid var(--rr-line);
  border-radius: 6px; color: var(--rr-text); }
.chip i { width: 7px; height: 7px; border-radius: 50%; }
.title { display: block; margin: 6px 0 4px; padding: 0; border: 0; background: none; text-align: left;
  font-size: 15px; font-weight: 600; color: var(--rr-text); }
.title:hover { color: var(--rr-accent); }
.excerpt { margin: 0; color: var(--rr-muted); display: -webkit-box; -webkit-line-clamp: 3;
  -webkit-box-orient: vertical; overflow: hidden; }
.reactions { display: flex; gap: 6px; margin-top: 10px; }
.reactions button { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px;
  border: 1px solid var(--rr-line); border-radius: 999px; background: #fff; font-size: 13px; }
.reactions button.on { border-color: var(--rr-accent); background: color-mix(in srgb, var(--rr-accent) 10%, #fff); }
.reactions span { font-size: 12px; color: var(--rr-muted); }
.post { padding: 18px; }
.post h2 { margin: 8px 0 12px; font-size: 18px; font-weight: 700; }
.cover { display: block; width: calc(100% + 36px); margin: -18px -18px 14px; aspect-ratio: 16/9; object-fit: cover; }
.content { color: var(--rr-text); overflow-wrap: anywhere; }
.content p { margin: 0 0 10px; } .content h2, .content h3 { margin: 16px 0 8px; font-weight: 700; }
.content ul, .content ol { margin: 0 0 10px; padding-left: 20px; }
.content img, .content iframe { max-width: 100%; border: 0; border-radius: 6px; }
.content iframe { width: 100%; aspect-ratio: 16/9; height: auto; }
.content a, .link { color: var(--rr-accent); }
.link { display: inline-block; margin-top: 14px; font-size: 13px; }
.form { display: flex; flex-direction: column; gap: 12px; padding: 18px; }
.form label { display: flex; flex-direction: column; gap: 4px; font-weight: 500; font-size: 13px; }
.form input, .form textarea { padding: 8px 10px; border: 1px solid var(--rr-line); border-radius: 8px;
  font-weight: 400; font-size: 14px; color: var(--rr-text); resize: vertical; }
.form input:focus, .form textarea:focus { outline: 2px solid var(--rr-accent); outline-offset: -1px; }
.error { margin: 0; color: #dc2626; font-size: 13px; }
.sent { padding: 40px 18px; text-align: center; }
.rr .sent strong { font-size: 16px; font-weight: 600; }
.sent p { margin: 6px 0 0; color: var(--rr-muted); }
`;
