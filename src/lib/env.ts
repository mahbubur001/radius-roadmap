import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_URL: z.url(),
    REDIS_URL: z.url().default("redis://localhost:6379"),

    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),

    // Email is always sent through Amazon SES (owner, 2026-11-01).
    EMAIL_FROM: z.string().default("Radius Roadmap <no-reply@localhost>"),
    // SES uses the default AWS credential chain (instance role on EC2)
    AWS_REGION: z.string().default("ap-south-1"), // Mumbai

    // File storage: Cloudflare R2, everywhere (doc 29 T11). Optional so the
    // app builds without it; uploads fail clearly until it's set.
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET: z.string().optional(),
    // The bucket's public address: a custom domain (files.example.com) or r2.dev
    R2_PUBLIC_URL: z.url().optional(),

    // Signs the anonymous visitor cookie and hashes voter IPs. Falls back to
    // a key derived from BETTER_AUTH_SECRET when unset.
    VISITOR_SECRET: z.string().min(32).optional(),
    // Cloudflare Turnstile (invisible) on anonymous and guest votes. Unset =
    // no check (dev); the .env.example values are Cloudflare's test keys.
    TURNSTILE_SECRET_KEY: z.string().optional(),
    // "1" only when the app sits behind Cloudflare: trusts its cf-connecting-ip
    // (vote rate limits) and cf-ipcountry/cf-ipcity (geo) headers.
    TRUST_CLOUDFLARE: z.enum(["0", "1"]).default("0"),

    // Stripe billing (doc 26 6A). Unset = billing off, every account unlimited.
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),

    // Custom domains (doc 26 6D): the hostname customers CNAME to, e.g.
    // domains.app.example.com. Unset = custom domains off (dev: *.localhost only).
    CUSTOM_DOMAIN_TARGET: z.string().optional(),

    // Platform admins (doc 28 C1): comma-separated emails that may open
    // /admin. Unset = nobody.
    PLATFORM_ADMIN_EMAILS: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.url(),
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    EMAIL_FROM: process.env.EMAIL_FROM,
    AWS_REGION: process.env.AWS_REGION,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET: process.env.R2_BUCKET,
    R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
    VISITOR_SECRET: process.env.VISITOR_SECRET,
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
    TRUST_CLOUDFLARE: process.env.TRUST_CLOUDFLARE,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    CUSTOM_DOMAIN_TARGET: process.env.CUSTOM_DOMAIN_TARGET,
    PLATFORM_ADMIN_EMAILS: process.env.PLATFORM_ADMIN_EMAILS,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  },
  emptyStringAsUndefined: true,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
