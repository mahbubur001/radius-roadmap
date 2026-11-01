import type { Metadata } from "next";
import { loadSite } from "./data";

/** The account's favicon, else its logo, on every public page (doc 26 B5). */
export async function generateMetadata({
  params,
}: LayoutProps<"/sites/[account]">): Promise<Metadata> {
  const site = await loadSite(decodeURIComponent((await params).account));
  if (!site) return {};
  const icon = site.brand.faviconUrl ?? (site.brand.logo ? site.logoUrl : null);
  return icon ? { icons: { icon } } : {};
}

export default function PublicSiteLayout({
  children,
}: LayoutProps<"/sites/[account]">) {
  return children;
}
