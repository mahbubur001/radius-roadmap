import { fontHref, fontStack } from "@/lib/fonts";
import type { EffectiveBranding } from "@/server/services/branding";

/**
 * The account's brand colour and font on a public page (doc 26 6C): CSS
 * variables picked up by globals.css, plus the font's stylesheet. Values come
 * from effectiveBranding (hex re-checked, font from a fixed list).
 */
export function SiteBrand({ brand }: { brand: EffectiveBranding }) {
  const vars = [
    brand.color ? `--brand:${brand.color.value}` : null,
    brand.color ? `--brand-foreground:${brand.color.foreground}` : null,
    brand.font ? `--site-font:${fontStack(brand.font)}` : null,
  ].filter(Boolean);
  return (
    <>
      {brand.font ? (
        <link
          rel="stylesheet"
          href={fontHref(brand.font)}
          precedence="default"
        />
      ) : null}
      {vars.length ? (
        <style
          // biome-ignore lint/security/noDangerouslySetInnerHtml: values validated by effectiveBranding
          dangerouslySetInnerHTML={{
            __html: `:root:has([data-site-theme]){${vars.join(";")}}`,
          }}
        />
      ) : null}
    </>
  );
}
