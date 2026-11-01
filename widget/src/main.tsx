import { render } from "preact";
import { type Api, createApi, type WidgetConfig } from "./api";
import { App, type Controls } from "./app";
import { styles } from "./styles";

// Entry of public/widget.js (doc 26 6B). The page sets
// window.radiusRoadmapConfig = { site: "<account>" } and loads this file.

// The app's origin, taken from this script's own URL.
const script = document.currentScript as HTMLScriptElement | null;
const base = new URL(
  script?.src ??
    document.querySelector<HTMLScriptElement>('script[src*="widget.js"]')
      ?.src ??
    location.href,
).origin;

let controls: Controls | null = null;
let pending: "show" | "hide" | "toggle" | null = null;
let started = false;

async function init(config = window.radiusRoadmapConfig) {
  if (started) return;
  if (!config?.site) {
    console.warn("[RadiusRoadmap] window.radiusRoadmapConfig.site is required");
    return;
  }
  started = true;
  const api: Api = createApi(base, config);
  let site: Awaited<ReturnType<Api["config"]>>;
  try {
    site = await api.config();
  } catch {
    // Unknown site, nothing public, or the plan has no widget: stay hidden.
    started = false;
    return;
  }

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
    <App
      api={api}
      config={config}
      site={site}
      onReady={(c) => {
        controls = c;
        if (pending) c[pending]();
        pending = null;
      }}
    />,
    mount,
  );

  if (config.selector) {
    document.addEventListener("click", (e) => {
      const target = e.target as Element | null;
      if (config.selector && target?.closest(config.selector)) {
        e.preventDefault();
        controls?.toggle();
      }
    });
  }
}

/** Calls made before the widget loaded run once it's ready. */
function call(action: "show" | "hide" | "toggle") {
  if (controls) controls[action]();
  else pending = action;
}

const api = {
  init: (config?: WidgetConfig) => void init(config),
  show: () => call("show"),
  hide: () => call("hide"),
  toggle: () => call("toggle"),
};

declare global {
  interface Window {
    RadiusRoadmap: typeof api;
    radiusRoadmapConfig?: WidgetConfig;
  }
}

window.RadiusRoadmap = api;
if (
  window.radiusRoadmapConfig &&
  window.radiusRoadmapConfig.autoInit !== false
) {
  if (document.body) void init();
  else document.addEventListener("DOMContentLoaded", () => void init());
}
