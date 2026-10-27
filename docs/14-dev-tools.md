# 14 — Dev Tools & Stack

Status: **CONFIRMED — only the product name/domain is open (not blocking).**

Scope changes approved 2026-10-27 (doc 15 §9, doc 16 §8) add: **Cloudflare Turnstile** (spam protection), **magic-link** voter sign-in (our own email-code/link flow for `tracked_users`, signed with `jose`; kept apart from Better Auth team users), **MaxMind GeoLite2** or Cloudflare geo headers for coarse vote location, and **CSV import/export** (`papaparse`). Build order: see `PROGRESS.md`.
Date: 2026-10-27

✅ = confirmed by the owner. 📘 = version checked against current docs in Context7.
Everything else is pinned to the latest stable release at install time.

---

## 1. Core

| Area | Tool | Version | Notes |
|------|------|---------|-------|
| Language | TypeScript (strict) | 5.x | |
| Framework | ✅ **Next.js** (App Router, Turbopack) | 📘 16.4.x (Cache Components on) | In v16, `middleware.ts` is renamed **`proxy.ts`**; it is used for hostname → account routing |
| UI runtime | React | 19.x | Comes with Next 16 |
| Runtime | Node.js | 22 LTS | |
| Package manager | **pnpm** | 10.x | |
| Repo layout | ✅ **Single Next.js app** (option A) | — | The worker and widget are separate build entry points in the same repo (see §10) |
| Library docs | ✅ **Context7 MCP** | — | Docs are looked up before writing code for any library |

## 2. Auth — ✅ Better Auth 📘 1.7.x

There are two kinds of user, each with its own auth:

| Who | How |
|-----|-----|
| **Team members** (dashboard admins/teammates) | Better Auth: email + password, Google, email verification, password reset. `organization` plugin: **organization = Account**, with members, roles (owner/admin/member) and invitations. `twoFactor` (optional). `nextCookies()` goes **last** in the plugins list. |
| **End users** (customers voting or commenting on public boards and widgets) | A separate lightweight identity in a `tracked_users` table, scoped to each account. It covers guest (name + email), anonymous, social login, and **customer SSO**: their app signs a JWT with HS256 using a per-account key, and the token is verified with **`jose`**. A separate signed cookie is used per public domain. |

Later plugins:
- `@better-auth/stripe` for billing
- `apiKey` for the public REST API
- `@better-auth/sso` for SAML

Database adapter: `drizzleAdapter(db, { provider: "pg" })`.

## 3. Data

| Area | Tool | Notes |
|------|------|-------|
| Database | ✅ **PostgreSQL 16+**, self-hosted on the app EC2 server | Listens on localhost only; nightly backups to S3 |
| ORM | ✅ **Drizzle ORM** + drizzle-kit | Plus `drizzle-zod` to generate Zod rules from tables |
| Validation | ✅ **Zod** | Shared by forms, server actions, API and jobs |
| Multi-tenancy | Every table has an `account_id`, enforced in a data-access layer | Optionally add Postgres row-level security later |
| Search | Postgres full-text search (`tsvector`) | For the knowledge base and boards |
| Cache / rate limit / queue | **Redis 7**, self-hosted on EC2 | Used by BullMQ, API rate limiting and vote throttling |

## 4. UI (admin and public pages)

| Area | Tool |
|------|------|
| Styling | **Tailwind CSS v4** |
| Components | **shadcn/ui** (Radix underneath) + lucide-react icons |
| Forms | ✅ **React Hook Form + Zod** (`@hookform/resolvers/zod`; the same schemas are re-checked in server actions) |
| Server state | Server Components + Server Actions; TanStack Query only where the client needs it |
| Tables | TanStack Table |
| Roadmap drag and drop | **dnd-kit** |
| Rich text (posts, articles) | **Tiptap** (stored as JSON, rendered to HTML) |
| Charts | Recharts (via shadcn charts) |
| Theming / white-label | CSS variables set per account (colors, font), `next-themes` for dark mode |
| Translations | **next-intl** |

## 5. Embeddable widget (`widget/` folder)

| Area | Tool |
|------|------|
| UI | **Preact** + TypeScript |
| Build | **Vite** library mode with its own `widget/vite.config.ts`, outputs `public/widget.js` (IIFE, under ~15 KB gzipped) |
| Isolation | Shadow DOM |
| API | `window.RadiusRoadmap.init/show/hide/toggle`, config `{ workspaceId, user, segment }` |
| Delivery | Served by Next.js from `/widget.js` on the app domain; S3 + CloudFront later if needed. **No process of its own.** |

## 6. Background work, email, files

| Area | Tool | Notes |
|------|------|-------|
| Jobs / queues | ✅ **BullMQ + Redis** | Runs in its own pm2 process (`worker`). Covers email sending, webhook delivery with retries/backoff, AI tagging, scheduled posts (delayed jobs) and repeating jobs. **Bull Board** dashboard at `/admin/queues`, for admins only |
| Email | ✅ **Amazon SES** (`@aws-sdk/client-sesv2`) | Bounces and complaints come back through SNS → webhook; a per-account custom SMTP option through **Nodemailer**; locally, emails go to Mailpit (`EMAIL_TRANSPORT=smtp`) or to the `console` transport, which logs them and saves them to `.dev-mail/` |
| Email templates | **React Email** | |
| File uploads | **Amazon S3** with presigned uploads | Same AWS account as everything else; CloudFront in front later |
| Real-time (live votes) | Phase 2: SSE from Next.js, with Redis pub/sub between instances | |

## 7. Platform features

| Area | Tool |
|------|------|
| Billing | **Stripe** via `@better-auth/stripe` (plans, proration, enforcing plan limits) |
| Custom domains + SSL | **Caddy** reverse proxy with **on-demand TLS**. Caddy asks `GET /api/internal/domain-check?domain=` before issuing a certificate, and `proxy.ts` maps the hostname to an account |
| AI (sentiment, duplicate merging, summaries) | **Claude API** via `@anthropic-ai/sdk`, run inside BullMQ jobs; Haiku 5.5 tags each item, Sonnet 5.5 writes summaries |
| Public REST API | Route Handlers under `/api/v1/*`, Better Auth `apiKey`, OpenAPI docs generated from Zod |
| Outgoing webhooks | Events table + BullMQ delivery with HMAC signatures |
| Jira | Jira Cloud REST API with OAuth 2.0 (3LO) |
| Analytics | PostHog (optional); per-account Google Analytics |

## 8. Quality & DX

| Area | Tool |
|------|------|
| Lint + format | ✅ **Biome** |
| Unit / integration tests | **Vitest** + Testing Library |
| End-to-end tests | **Playwright** (admin, public pages, widget on a test page) |
| Git hooks | Lefthook (Biome + typecheck on commit) |
| Environment variables | `@t3-oss/env-nextjs` (checks env vars with Zod) |
| Errors | **Sentry** (web + worker) |
| CI/CD | GitHub Actions: typecheck, lint, test, build, then deploy to EC2 over SSH |
| Local services | Docker Compose: Postgres, Redis, Mailpit |

## 9. Hosting — ✅ AWS EC2 + pm2

```
                 Internet
                    │  app.<domain>  +  customer custom domains (CNAME)
                    ▼
        ┌──────── EC2 (app server) ────────┐
        │ Caddy :443 (auto + on-demand TLS) │
        │   └─▶ pm2 "web"    next start :3000│
        │       pm2 "worker" node dist/worker│
        │       Redis 7 (systemd/docker)     │
        └───────────────┬────────────────────┘
                        │ private VPC
                 PostgreSQL 16 (same EC2, localhost only)
        S3 (uploads) · SES (email) · CloudWatch/Sentry (logs/errors)
```

```js
// ecosystem.config.js
module.exports = { apps: [
  { name: "web",    script: "node_modules/next/dist/bin/next", args: "start -p 3000", instances: 1 },
  { name: "worker", script: "dist/worker.js", instances: 1 },
]};
```

- **2 pm2 processes, 1 app domain.** The widget is a static file served by `web`.
- Deploy: `git pull && pnpm i --frozen-lockfile && pnpm build && pm2 reload ecosystem.config.js`
- Build scripts: `build:web` (next build), `build:worker` (tsup → `dist/worker.js`), `build:widget` (vite → `public/widget.js`), and `build`, which runs all three.
- Backups: nightly `pg_dump` to S3, plus Postgres WAL archiving later.

## 10. Repo layout (option A — single app)

```
radius-roadmap/
├─ src/
│  ├─ app/
│  │  ├─ (auth)/            # login, register, verify, invite
│  │  ├─ (dashboard)/       # /[workspace]/feedback|roadmap|updates|articles|settings
│  │  ├─ (public)/          # tenant public site (resolved from hostname)
│  │  └─ api/               # auth handler, /v1 REST, widget API, SES/SNS + Stripe webhooks
│  ├─ components/           # shadcn/ui + app components
│  ├─ server/
│  │  ├─ db/                # Drizzle schema, migrations, client
│  │  ├─ auth/              # Better Auth config + tracked-user auth
│  │  ├─ services/          # business logic (feedback, roadmap, updates…)
│  │  ├─ queue/             # BullMQ queue definitions (producers)
│  │  └─ email/             # React Email templates + SES sender
│  ├─ jobs/                 # BullMQ job handlers (consumers)
│  ├─ lib/                  # shared utils, zod schemas, env
│  └─ proxy.ts              # hostname → account rewrite
├─ worker.ts                # worker entry: registers src/jobs handlers
├─ widget/                  # Preact source + vite.config.ts → public/widget.js
├─ public/
├─ docs/
├─ docker-compose.yml       # local Postgres, Redis, Mailpit
├─ ecosystem.config.js      # pm2
├─ Caddyfile
└─ biome.json
```

---

## ✅ Confirmed
1. ORM: **Drizzle**
2. Hosting: **AWS EC2 + pm2**, own Postgres server
3. Repo: **single Next.js app (A)**
4. Lint: **Biome**
5. Jobs: **BullMQ + Redis**
6. Email: **Amazon SES**
7. Forms: **React Hook Form + Zod**

8. Postgres: **same EC2 server as the app**. Bind it to localhost only, run nightly `pg_dump` to S3, and use an instance with at least 4 GB RAM. It can move to a separate server or RDS later by changing `DATABASE_URL`.
9. MVP order: **accounts/workspaces → feedback boards → roadmap → updates → public pages + widget → billing**

## ❓ Still open
1. **Product name and app domain:** "Radius Roadmap"? Domain? (Not needed to start local development.)

## Versions as built (Phase 0, 2026-10-27)
Installed versions differ from the planning estimates above. These are the ones in `package.json`:
- Next.js **16.4.3** with `cacheComponents: true`. Runtime data (cookies, headers, params, searchParams, `useParams`/`useSearchParams`) must be read inside `<Suspense>`. Next's bundled docs are in `node_modules/next/dist/docs/` (see `AGENTS.md`).
- Better Auth **1.7.14** + `@better-auth/drizzle-adapter`. The CLI package is now `auth` (`pnpm auth:generate`).
- React 19.3, Zod 4, Drizzle ORM 0.45 / drizzle-kit 0.31, BullMQ 6 with ioredis **5** (pinned to BullMQ's own ioredis).
- `react-email` 6 (components and `render` both come from `react-email`; `@react-email/components` is no longer used).
- Vitest 5, Playwright 1.64, Vite 8, Preact 11, Biome 2.4, Lefthook, tsup (worker bundle).
- shadcn/ui preset `radix-nova`.
- Email transports: `console` (dev default), `smtp` (Mailpit / custom SMTP), `ses`.
- Local services: Docker Compose **or** native Homebrew Postgres + Redis. The owner's Mac has no Docker and Mailpit wouldn't install, so it uses the `console` email transport.
- pm2 file is `ecosystem.config.cjs`, because the package is `"type": "module"`.
- Phase 1 additions:
  - `@aws-sdk/client-s3` + `@aws-sdk/s3-presigned-post` (presigned **POST**, because it can cap file size)
  - env `STORAGE_DRIVER` (`local`|`s3`), `UPLOAD_DIR`, `S3_BUCKET`, `S3_PUBLIC_URL`
  - `dotenv-cli` removed: `dotenv` 18 ships its own CLI (`dotenv run -f .env.local -- …`)
