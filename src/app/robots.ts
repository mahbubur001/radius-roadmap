import type { MetadataRoute } from "next";

/**
 * One robots.txt for the app domain (doc 19, D1 revised). Public sites
 * (/<account>/…) are crawlable; each has its own /<account>/sitemap.xml and
 * per-workspace noindex is set on the pages themselves.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/dashboard/",
        "/onboarding",
        "/sign-in",
        "/sign-up",
        "/check-email",
        "/forgot-password",
        "/reset-password",
        "/accept-invite/",
        "/no-access",
      ],
    },
  };
}
