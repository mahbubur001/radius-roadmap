# 17 — Scaffold Plan (Phase 0)

Status: **DRAFT — awaiting approval before running any commands.**
Date: 2026-10-27
Stack source of truth: [14-dev-tools.md](14-dev-tools.md). Approved scope changes: [15](15-public-site-audit.md) §9 and [16](16-admin-ui-walkthrough.md) §8.

Goal: an empty but fully wired app. Sign up, sign in, create an account (organization) and a workspace, see the dashboard shell. A background job sends an email to Mailpit. The widget bundle builds. Lint, typecheck and tests pass. No product features yet.

---

## Step 0 — Prerequisites (each PC)
- Node.js 22 LTS, pnpm 10 (`corepack enable`), Docker Desktop, git.
- **A private Git remote (GitHub) is required** to work from several PCs. All plans and progress live in the repo (`docs/`), not in Claude's local memory.

## Step 1 — Create the Next.js app
- Run `pnpm create next-app@latest` into a **temporary folder**: TypeScript, Tailwind, **Biome** linter, App Router, `src/` dir, alias `@/*`, Turbopack, AGENTS.md off (we have CLAUDE.md).
- Merge its files into the repo root, because the root already has `docs/`, `CLAUDE.md`, `.mcp.json` and `.gitignore`.
- Pin `next@16.2.x`, `react@19`. Check that `pnpm dev` runs.

## Step 2 — Tooling
- `biome.json` (formatter + linter, ignore `.next`, `dist`, `public/widget.js`).
- `tsconfig.json` with `strict`, `noUncheckedIndexedAccess`.
- `lefthook.yml`: pre-commit runs `biome check --write` on staged files plus `tsc --noEmit`.
- `src/lib/env.ts` using `@t3-oss/env-nextjs` + Zod. Add `.env.example` with every variable.
- Scripts in `package.json` (as listed in CLAUDE.md): `dev`, `worker:dev`, `widget:dev`, `build`, `build:web`, `build:worker`, `build:widget`, `check`, `typecheck`, `test`, `test:e2e`, `db:generate`, `db:migrate`, `db:studio`.

## Step 3 — Local services
- `docker-compose.yml` with:
  - `postgres:16` (port 5432, volume)
  - `redis:7` (6379)
  - `axllent/mailpit` (SMTP 1025, UI 8025)

## Step 4 — Database (Drizzle)
- Install `drizzle-orm`, `pg`, `drizzle-kit`, `drizzle-zod`.
- `drizzle.config.ts` → schema `src/server/db/schema/*`, migrations in `drizzle/`.
- `src/server/db/client.ts`: a single `pg` Pool + drizzle instance, reused across hot reloads.

## Step 5 — Auth (Better Auth 1.6)
- `src/server/auth/index.ts`:
  - `betterAuth({ database: drizzleAdapter(db, { provider: "pg" }), emailAndPassword: { enabled: true, requireEmailVerification: true }, socialProviders: { google }, plugins: [organization(), nextCookies()] })`
  - `nextCookies()` goes last.
  - Verification and invite emails go out through the queue (Step 8).
- `src/app/api/auth/[...all]/route.ts` → `toNextJsHandler(auth)`.
- `src/lib/auth-client.ts` → `createAuthClient` + `organizationClient`.
- Generate the auth tables with the Better Auth CLI `generate --adapter drizzle`, then `db:generate` + `db:migrate`.
- **Organization = Account** (tenant). Roles: owner / admin / member.

## Step 6 — Tenant base
- Schema: `workspaces` (`id`, `account_id` → organization, `name`, `slug`, `settings` JSONB, timestamps).
- `src/server/tenant.ts`:
  - `getTenantContext()` reads the session, active organization and workspace from the route.
  - `requireRole()` checks the member's role.
- `src/proxy.ts`: hostname/path → public tenant resolution (skeleton only; custom domains come later).
- Vitest test: a service call with account A cannot read account B's workspace.

## Step 7 — UI shell
- `shadcn` init (Tailwind v4, CSS variables) with base components: button, input, form, card, dialog, sheet, dropdown, sonner, avatar, badge, tabs, table.
- React Hook Form + Zod + `@hookform/resolvers`.
- Route groups:
  - `(auth)`: sign in, sign up, verify email, forgot/reset password, accept invite.
  - `(dashboard)`: onboarding ("create account + first workspace"), and a `/[workspace]` shell with an icon sidebar (Home, Feedback, Roadmap, Updates, Articles, Settings, Public settings) and a top bar. Pages are placeholders.
  - `(public)`: placeholder `/p/[workspace]` page.
- `next-themes` dark mode; brand colors as CSS variables (for white-labelling later).

## Step 8 — Email + queue
- `src/server/email/`:
  - React Email templates (verify email, reset password, invite).
  - A `sendEmail()` that uses **SES** (`@aws-sdk/client-sesv2`) in production and **SMTP → Mailpit** (nodemailer) in development, switched by env.
- `src/server/queue/`: a shared Redis connection (`ioredis`) and a BullMQ `emailQueue` (producer).
- `src/jobs/send-email.ts` (consumer) and `worker.ts` (registers the workers, shuts down cleanly).
- Dev: `tsx watch worker.ts`. Build: `tsup worker.ts → dist/worker.js`.

## Step 9 — Widget skeleton
- `widget/` with Preact + Vite library mode → `public/widget.js` (IIFE).
- Mounts a Shadow DOM "Hello from Radius Roadmap" button, and exposes `window.RadiusRoadmap.init/show/hide/toggle`.
- `public/widget-test.html` for local testing.

## Step 10 — Tests
- Vitest config, the tenant-isolation test, and one Zod schema test.
- Playwright config + a smoke test: sign up → verify (read the code from the Mailpit API) → create workspace → see the dashboard.

## Step 11 — Deploy files (not deployed yet)
- `ecosystem.config.cjs` (pm2: `web`, `worker`).
- `Caddyfile` template (app domain + on-demand TLS with an `ask` endpoint stub).
- `scripts/deploy.sh`: pull, install, build, migrate, `pm2 reload`.
- GitHub Actions `ci.yml`: install → check → typecheck → test → build.

## Step 12 — Docs
- Update `CLAUDE.md` commands to match the real scripts.
- Update `docs/PROGRESS.md`.

---

## Done when
- [x] `docker compose up -d` + `pnpm dev` + `pnpm worker:dev` start cleanly. (Tested with native Postgres + Redis; Docker is not on the owner's Mac.)
- [x] Sign up → verification email delivered through BullMQ (console transport → `.dev-mail/`; Mailpit when `EMAIL_TRANSPORT=smtp`) → verify → sign in.
- [x] Onboarding creates an organization (account) and a workspace → the dashboard shell loads at `/<workspace>`.
- [x] `pnpm build:widget` produces `public/widget.js`; `widget-test.html` shows the button.
- [x] `pnpm check`, `pnpm typecheck`, `pnpm test` pass; the Playwright smoke test passes.

**Phase 0 finished 2026-10-27.**

## Not in Phase 0
Feedback, roadmap, voting, updates, KB, billing, custom domains, SSO, imports. These start in Phase 1 (see PROGRESS.md).

## Needs from you
1. **Git remote:** create an empty **private GitHub repo** and give me its URL, or tell me to only run `git init` locally for now.
2. **Google OAuth** client ID/secret (for "Sign in with Google"). Optional: email/password works without it, and it can be added later.
