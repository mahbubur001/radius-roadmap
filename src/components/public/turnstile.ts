// Cloudflare Turnstile, invisible mode (doc 19 D3). Without a site key
// (local dev) no token is needed and the server skips the check.

type Turnstile = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  execute: (id: string) => void;
  reset: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
let loading: Promise<Turnstile> | null = null;

function load() {
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () =>
      window.turnstile
        ? resolve(window.turnstile)
        : reject(new Error("Turnstile"));
    script.onerror = () => reject(new Error("Turnstile failed to load"));
    document.head.appendChild(script);
  });
  return loading;
}

/** A fresh Turnstile token, or undefined when Turnstile isn't configured. */
export async function turnstileToken(): Promise<string | undefined> {
  if (!SITE_KEY) return undefined;
  const turnstile = await load();
  const host = document.createElement("div");
  host.style.display = "none";
  document.body.appendChild(host);
  try {
    return await new Promise<string>((resolve, reject) => {
      const id = turnstile.render(host, {
        sitekey: SITE_KEY,
        execution: "execute",
        appearance: "interaction-only",
        callback: resolve,
        "error-callback": () => reject(new Error("Verification failed")),
      });
      turnstile.execute(id);
    });
  } finally {
    host.remove();
  }
}
