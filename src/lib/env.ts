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

    // "console" (dev: log + save to .dev-mail/), "smtp" (Mailpit / custom SMTP), "ses" (production)
    EMAIL_TRANSPORT: z.enum(["console", "smtp", "ses"]).default("console"),
    EMAIL_FROM: z.string().default("Radius Roadmap <no-reply@localhost>"),
    SMTP_HOST: z.string().default("localhost"),
    SMTP_PORT: z.coerce.number().default(1025),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    // SES uses the default AWS credential chain (instance role on EC2)
    AWS_REGION: z.string().default("us-east-1"),

    // File uploads: "local" (dev: files in UPLOAD_DIR) or "s3" (production)
    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    UPLOAD_DIR: z.string().default(".uploads"),
    S3_BUCKET: z.string().optional(),
    // Public base URL for stored files (bucket URL or CloudFront)
    S3_PUBLIC_URL: z.url().optional(),

    // Public sites live at <account-slug>.<PUBLIC_ROOT_DOMAIN> (doc 19 D1).
    // Locally "localhost:3000" → http://acme.localhost:3000
    PUBLIC_ROOT_DOMAIN: z.string().default("localhost:3000"),
    // Signs the anonymous visitor cookie and hashes voter IPs. Falls back to
    // a key derived from BETTER_AUTH_SECRET when unset.
    VISITOR_SECRET: z.string().min(32).optional(),
    // Cloudflare Turnstile (invisible) on anonymous and guest votes. Unset =
    // no check (dev); the .env.example values are Cloudflare's test keys.
    TURNSTILE_SECRET_KEY: z.string().optional(),
    // "1" only when the app sits behind Cloudflare: trusts its cf-connecting-ip
    // (vote rate limits) and cf-ipcountry/cf-ipcity (geo) headers.
    TRUST_CLOUDFLARE: z.enum(["0", "1"]).default("0"),
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
    EMAIL_TRANSPORT: process.env.EMAIL_TRANSPORT,
    EMAIL_FROM: process.env.EMAIL_FROM,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASSWORD: process.env.SMTP_PASSWORD,
    AWS_REGION: process.env.AWS_REGION,
    STORAGE_DRIVER: process.env.STORAGE_DRIVER,
    UPLOAD_DIR: process.env.UPLOAD_DIR,
    S3_BUCKET: process.env.S3_BUCKET,
    S3_PUBLIC_URL: process.env.S3_PUBLIC_URL,
    PUBLIC_ROOT_DOMAIN: process.env.PUBLIC_ROOT_DOMAIN,
    VISITOR_SECRET: process.env.VISITOR_SECRET,
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
    TRUST_CLOUDFLARE: process.env.TRUST_CLOUDFLARE,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  },
  emptyStringAsUndefined: true,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
