# Radius Roadmap

A multi-tenant SaaS for customer feedback, public roadmaps, changelogs (updates) and knowledge bases, modelled on LoopedIn.

## Session start / end (multi-PC workflow)

The owner works from several computers. **Claude's local memory does not travel between PCs. The repo does.**
- **Start of every session:** read `docs/PROGRESS.md` and continue from its "Next step". Read the docs it points to as needed.
- **Before ending a session, or when the user says they're stopping:** update `docs/PROGRESS.md` (Current status, Next step, Phase checklist, Session log row with date + PC + done + next). Record any new decision in it and in the relevant `docs/*.md`. Then remind the user to commit + push.
- New plans and decisions are written to `docs/*.md` and approved by the user **before** implementation.

## Docs

- Progress and state: **`docs/PROGRESS.md`**
- Product research: `docs/00-full-report.md` (modules in `docs/01`–`13`)
- Live audits + approved scope changes: `docs/15-public-site-audit.md` §9, `docs/16-admin-ui-walkthrough.md` §8
- Current phase plan: `docs/17-scaffold-plan.md`
- **Stack and decisions: `docs/14-dev-tools.md`**. That doc is the source of truth. Don't swap a listed tool without asking.

## Stack (confirmed)

Next.js 16 (App Router, `proxy.ts`) · React 19 · TypeScript strict · pnpm · Better Auth 1.7 · Drizzle ORM + PostgreSQL 16 · Zod · React Hook Form · Tailwind v4 + shadcn/ui · dnd-kit · Tiptap · BullMQ + Redis · Amazon SES + React Email · S3 · Stripe · Biome · Vitest · Playwright. Deployed on AWS EC2 with pm2 (`web` + `worker`) behind Caddy.

## Library docs: use Context7

Before writing or changing code that uses any library, **query Context7** (`resolve-library-id` → `query-docs`) with the version from `package.json`. Don't rely on memory. Next 16 and Better Auth 1.7 differ from older versions; for example, `middleware.ts` is now `proxy.ts`.

## Layout (single app)

```
src/app/(auth)        login/register/verify/invite
src/app/(dashboard)   /[workspace]/feedback|roadmap|updates|articles|settings
src/app/(public)      tenant public site, resolved from hostname in src/proxy.ts
src/app/api           auth handler, /v1 REST, widget API, webhooks (SES/SNS, Stripe)
src/server/db         Drizzle schema + migrations + client
src/server/auth       Better Auth (team) + tracked-user auth (end users)
src/server/services   business logic, the only place that touches db
src/server/queue      BullMQ queue producers
src/server/email      React Email templates + SES sender
src/jobs              BullMQ handlers (run by worker.ts, never by Next)
src/lib               utils, shared Zod schemas, env
widget/               Preact embeddable widget → public/widget.js (Vite)
```

## Commands

```bash
docker compose up -d        # local Postgres, Redis, Mailpit (or native Postgres + Redis)
pnpm dev                    # Next dev server (http://localhost:3000)
pnpm worker:dev             # BullMQ worker (tsx watch)
pnpm widget:dev             # widget build watch
pnpm db:generate            # drizzle-kit generate (after schema change)
pnpm db:migrate             # apply migrations
pnpm db:studio
pnpm auth:generate          # regenerate Better Auth tables → src/server/db/schema/auth.ts
pnpm check                  # biome check --write
pnpm lint                   # biome check (no writes, used by CI)
pnpm typecheck              # next typegen + tsc (app + widget)
pnpm test                   # vitest, against the <db>_test database (migrated automatically)
pnpm test:e2e               # playwright; reuses running dev server + worker
pnpm build                  # build:widget + build:web + build:worker (tsup → dist/worker.js)
```

Keep this list in sync with `package.json`. Deploy files: `ecosystem.config.cjs` (pm2), `deploy/Caddyfile`, `scripts/deploy.sh`, `.github/workflows/ci.yml`.

## Rules

### Next.js 16 specifics
- Read `AGENTS.md`: Next's version-matched docs are in `node_modules/next/dist/docs/`.
- **Cache Components is on.** Anything that reads runtime data (`cookies()`, `headers()`, `params`, `searchParams`, `useParams`, `useSearchParams`, the session) must render inside `<Suspense>`. Pattern: the page/layout passes `params.then(...)` into a small async child component (the "gate") wrapped in `<Suspense>`.
- Server actions are wrapped with `action(schema, handler)` from `src/server/action.ts`: it re-validates with the form's Zod schema and maps service errors (`ForbiddenError`, `NotFoundError`, `ConflictError`) to `{ ok: false, error }`. Shared dashboard actions live in `src/app/(dashboard)/_actions/`.
- Next keeps earlier pages mounted but hidden (Activity). In Playwright, prefer role queries or scope to the open `dialog`, because `getByLabel` also matches the hidden copies.
- Every dashboard page and server action under `[workspace]` calls `requireWorkspace(slug)` (from `src/server/session.ts`) to get its tenant context. Never derive the account from anything else.

### Multi-tenancy (critical)
- Every tenant table has `account_id` (and `workspace_id` where it applies). **Every query must be scoped.** Go through `src/server/services/*`, which take a tenant context. Never import `db` in components, route handlers or server actions directly.
- Public pages resolve the account from the hostname (`proxy.ts`). Never trust an `accountId` sent by the client.
- Write a test for each service proving that data from another account can't be read.

### Team and roles
- Owners and admins see every workspace; members only see workspaces granted in `workspace_members`. The rules are in `src/server/services/team.ts` and `invitations.ts`.
- Better Auth's HTTP endpoints for organization writes are disabled (`disabledPaths` in `src/server/auth`). Never re-enable them or call `authClient.organization.*` for team changes; go through our services.

### Uploads
- Use `src/server/storage` only: `createUpload` (signed POST form), `fileUrl`, `deleteFile`. Keys always sit under a tenant prefix (`prefixes.*`); check them with `keyHasPrefix` before saving.
- `STORAGE_DRIVER=local` keeps files in `.uploads/` (dev); `s3` is for production.

### Two kinds of user
- **Team members** (dashboard) use Better Auth. Organization = Account; check roles (owner/admin/member) on every mutation.
- **End users** (voters and commenters on public pages and the widget) are `tracked_users`, scoped per account: guest, anonymous, social, or customer SSO JWT (HS256, verified with `jose`). Never mix the two in Better Auth's user table.

### Validation and forms
- One Zod schema per input in `src/lib/schemas`, used by React Hook Form (`zodResolver`) **and** re-checked on the server (server action / route handler).
- Prefer `drizzle-zod` to derive schemas from tables.

### Data and migrations
- Change the schema in `src/server/db/schema/*`, then run `pnpm db:generate`. Commit the SQL migration files. Never edit an applied migration.
- Use Postgres full-text search for search; don't add a search service without asking.

### Background work
- Anything slow or retryable (email, outgoing webhooks, AI tagging, Jira sync, scheduled posts) goes into a BullMQ job. Don't do it inline in a request.
- Jobs must be idempotent (safe to run twice). Pass ids, not whole objects.

### Email
- Send only through `src/server/email` (SES, or the account's custom SMTP). Locally, use `EMAIL_TRANSPORT=console` (logs the email and saves it to `.dev-mail/*.json`; the e2e tests read links from there) or `smtp` with Mailpit.

### Widget
- `widget/` must stay tiny: Preact only, no imports from `src/` except type-only imports, everything rendered in Shadow DOM.

### Code style
- Biome formats and lints; run `pnpm check` before finishing. TypeScript strict, no `any`.
- Server Components by default; add `"use client"` only where needed.
- UI uses shadcn/ui components in `src/components/ui`; theme colors come from CSS variables (for white-labelling). No hard-coded brand colors.

### Secrets
- Env vars are validated in `src/lib/env.ts` (`@t3-oss/env-nextjs`). Add new ones there and to `.env.example`. Never commit `.env*` (except `.env.example`).

## Git
- Never add Claude or Anthropic as a co-author or in commit or PR text.
- Commit only when asked.
