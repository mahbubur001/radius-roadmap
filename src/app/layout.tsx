import type { Metadata } from "next";
import {
  Familjen_Grotesk,
  Geist,
  Geist_Mono,
  Hanken_Grotesk,
  JetBrains_Mono,
  Schibsted_Grotesk,
} from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});
// Headings and big numbers in the dashboard (doc 30).
const display = Schibsted_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});
// Public sites, "Transit" (doc 32). Not preloaded: only public pages use
// them, and the browser fetches a font only when a page renders with it.
const transitDisplay = Familjen_Grotesk({
  variable: "--font-transit-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  preload: false,
});
const transitText = Hanken_Grotesk({
  variable: "--font-transit-text",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  preload: false,
});
const transitMono = JetBrains_Mono({
  variable: "--font-transit-mono",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  preload: false,
});

export const metadata: Metadata = {
  title: { default: "Radius Roadmap", template: "%s · Radius Roadmap" },
  description: "Customer feedback, public roadmaps and changelogs.",
  // In public/ (not app/favicon.ico) so public sites can set their own (doc 26 B5).
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} ${transitDisplay.variable} ${transitText.variable} ${transitMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
