import { render } from "preact";
import { useState } from "preact/hooks";
import { styles } from "./styles";

export type WidgetConfig = {
  workspaceId: string;
  user?: { name?: string; email?: string };
  segment?: Record<string, string>;
  /** CSS selector of a custom launcher; hides the default button. */
  selector?: string;
};

type Controls = { show(): void; hide(): void; toggle(): void };

let controls: Controls | null = null;

function Widget({
  config,
  onReady,
}: {
  config: WidgetConfig;
  onReady: (c: Controls) => void;
}) {
  const [open, setOpen] = useState(false);
  onReady({
    show: () => setOpen(true),
    hide: () => setOpen(false),
    toggle: () => setOpen((o) => !o),
  });

  return (
    <>
      {config.selector ? null : (
        <button
          type="button"
          class="launcher"
          aria-label="What's new"
          onClick={() => setOpen((o) => !o)}
        >
          ★
        </button>
      )}
      {open ? (
        <div class="panel" role="dialog" aria-label="Radius Roadmap">
          <header>
            <strong>What's new</strong>
            <button
              type="button"
              class="close"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </header>
          <p>Hello from Radius Roadmap 👋</p>
          <p class="muted">Workspace: {config.workspaceId}</p>
        </div>
      ) : null}
    </>
  );
}

function init(config: WidgetConfig) {
  if (controls) return controls;
  if (!config?.workspaceId)
    throw new Error("[RadiusRoadmap] workspaceId is required");

  // Shadow DOM keeps host-site CSS out and ours in.
  const host = document.createElement("div");
  host.id = "radius-roadmap-widget";
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = styles;
  shadow.appendChild(style);
  const mount = document.createElement("div");
  shadow.appendChild(mount);

  render(
    <Widget
      config={config}
      onReady={(c) => {
        controls = c;
      }}
    />,
    mount,
  );

  if (config.selector) {
    document.querySelectorAll(config.selector).forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        controls?.toggle();
      });
    });
  }
  return controls;
}

const api = {
  init,
  show: () => controls?.show(),
  hide: () => controls?.hide(),
  toggle: () => controls?.toggle(),
};

declare global {
  interface Window {
    RadiusRoadmap: typeof api;
    radiusRoadmapConfig?: WidgetConfig;
  }
}

window.RadiusRoadmap = api;
if (window.radiusRoadmapConfig) init(window.radiusRoadmapConfig);
