// Colour maths for brand colours (doc 26 B3). Hex in, WCAG numbers out.

export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const DARK_TEXT = "#0f172a";
const LIGHT_TEXT = "#ffffff";

function channels(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string) {
  const [r = 0, g = 0, b = 0] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 to 21. */
export function contrastRatio(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

/** Text colour for a background: white or near-black, whichever reads better. */
export function foregroundFor(hex: string) {
  return contrastRatio(hex, LIGHT_TEXT) >= contrastRatio(hex, DARK_TEXT)
    ? LIGHT_TEXT
    : DARK_TEXT;
}
