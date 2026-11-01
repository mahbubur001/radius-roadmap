// Fonts an account can pick for its public site and widget (doc 26 P12, B6).
// Loaded from Google Fonts with one <link>; no font = the app's own font.

export const FONTS = [
  { id: "inter", name: "Inter", serif: false },
  { id: "roboto", name: "Roboto", serif: false },
  { id: "open-sans", name: "Open Sans", serif: false },
  { id: "lato", name: "Lato", serif: false },
  { id: "poppins", name: "Poppins", serif: false },
  { id: "montserrat", name: "Montserrat", serif: false },
  { id: "nunito", name: "Nunito", serif: false },
  { id: "source-sans-3", name: "Source Sans 3", serif: false },
  { id: "work-sans", name: "Work Sans", serif: false },
  { id: "dm-sans", name: "DM Sans", serif: false },
  { id: "manrope", name: "Manrope", serif: false },
  { id: "ibm-plex-sans", name: "IBM Plex Sans", serif: false },
  { id: "merriweather", name: "Merriweather", serif: true },
  { id: "lora", name: "Lora", serif: true },
  { id: "playfair-display", name: "Playfair Display", serif: true },
] as const;

export type FontId = (typeof FONTS)[number]["id"];

export const FONT_IDS = FONTS.map((f) => f.id) as [FontId, ...FontId[]];

export function findFont(id: string | null | undefined) {
  return FONTS.find((f) => f.id === id) ?? null;
}

/** Stylesheet URL for one font (weights 400–700, swap). */
export function fontHref(font: { name: string }) {
  const family = font.name.replace(/ /g, "+");
  return `https://fonts.googleapis.com/css2?family=${family}:wght@400;500;600;700&display=swap`;
}

/** CSS font-family value with a fallback stack. */
export function fontStack(font: { name: string; serif: boolean }) {
  return `"${font.name}", ${font.serif ? "Georgia, serif" : "system-ui, sans-serif"}`;
}

/** Preview URL for the settings picker: only the letters of the name. */
export function fontPreviewHref() {
  const families = FONTS.map((f) => `family=${f.name.replace(/ /g, "+")}`);
  const letters = [...new Set(FONTS.map((f) => f.name).join(""))].join("");
  return `https://fonts.googleapis.com/css2?${families.join("&")}&text=${encodeURIComponent(letters)}&display=swap`;
}
