# PROGRESS — Radius Roadmap

> **Read this first at the start of every session, on any PC. Update it before you stop.**
> This file plus `docs/` hold all of the project's plans and state. Claude's local memory is per-machine and does **not** carry over between PCs.

## How to resume on any PC
1. `git pull`
2. First time on this PC:
   - Install Node 22+, pnpm 10 (`corepack enable`), and either Docker or native Postgres 16+ and Redis 7.
   - Copy `.env.example` → `.env.local` and fill it in (`openssl rand -base64 32` for `BETTER_AUTH_SECRET`).
   - Create the databases `radius_roadmap` and `radius_roadmap_test` if you're not using Docker.
   - Run `pnpm exec playwright install chromium` once.
3. `pnpm install` → `docker compose up -d` (skip if native) → `pnpm db:migrate`
4. `pnpm dev` (+ `pnpm worker:dev` in a second terminal). Sign up at http://localhost:3000/sign-up. With `EMAIL_TRANSPORT=console`, the verification link is printed by the worker and saved in `.dev-mail/`.
5. In Claude Code: *"Read docs/PROGRESS.md and continue from Next step."*
6. Before stopping: update **Current status**, **Next step** and the **Session log** here, then commit and push.

## Key docs
- Product research (LoopedIn): `docs/00-full-report.md`, `01`–`13`
- Stack (confirmed): `docs/14-dev-tools.md`
- Public audit + approved changes: `docs/15-public-site-audit.md` §9
- Admin audit + approved changes: `docs/16-admin-ui-walkthrough.md` §8
- Phase 0 scaffold plan (done): `docs/17-scaffold-plan.md`
- Stack versions as built: `docs/14-dev-tools.md` → "Versions as built"

## Current status
- **Phase:** Phase 0 (scaffold) **finished** on 2026-10-27. Every "Done when" item in doc 17 passes.
- **Code:**
  - Next 16.4 app with Better Auth (email/password, verification, reset, organizations = accounts, invitations).
  - Onboarding creates an account and its first workspace.
  - Dashboard shell at `/<workspace>`, with placeholder pages for each module.
  - Tenant-scoped `workspaces` service, with an isolation test.
  - BullMQ email queue and worker; React Email templates; console/smtp/ses transports.
  - Hostname proxy skeleton for public sites.
  - Preact widget skeleton (`public/widget.js`, ~6.5 KB gzipped).
  - Deploy files (pm2, Caddy, deploy script, CI).
- **Checks:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (15 tests), `pnpm test:e2e` (sign-up → verify → onboarding → dashboard) and `pnpm build` all pass.
- **Git:** `git init` done on `main`, with remote `origin` = `git@github.com:mahbubur001/radius-roadmap.git`. Nothing is committed yet; local only, per the owner's instruction.
- **This Mac:** no Docker, and Mailpit won't install, so it uses Homebrew Postgres 18 + Redis and `EMAIL_TRANSPORT=console`.

## Next step
1. Owner: review Phase 0, then make the first commit (and push when ready).
2. Write the **Phase 1 plan** (`docs/18-phase-1-plan.md`) and get it approved before coding. Phase 1 covers:
   - account settings
   - workspace create/switch/rename/delete
   - team members and invitations UI with role checks
   - an invite-email e2e test
   - basic workspace settings (name, slug, logo upload to S3 or a local stub)
   - the `tracked_users` table design

## Decisions (approved)
- Stack per doc 14:
  - Next.js 16.4, Better Auth 1.7, Drizzle + Postgres 16 (on the same EC2), BullMQ + Redis
  - Amazon SES, React Hook Form + Zod, Biome
  - single app (repo option A), EC2 + pm2 (`web` + `worker`) + Caddy
  - Context7 for library docs
- All plan changes in doc 15 §9 and doc 16 §8 (approved 2026-10-27), including:
  - Server-rendered, indexable public pages; auto-resize embed; WordPress plugin later
  - Voter sign-in: magic link / Google / guest / customer SSO. No SaaS account for voters
  - Cloudflare Turnstile on public submissions and guest votes
  - Anonymous voting with dedupe (visitor cookie + hashed IP) and coarse geo
  - Separate status and category; card tags, planned-for date, features (progress), linked feedback
  - Internal vs public title/summary; per-column public toggle; display toggles
  - Triage inbox for new requests; CSV import/export; LoopedIn CSV migration
  - Analytics events + dashboard; comments/follows optional (default off); autosave
- **Build order:**
  1. Phase 0 — Scaffold
  2. Phase 1 — Accounts + workspaces + team/invites + settings basics
  3. Phase 2 — Roadmap + voting + public roadmap page + embed
  4. Phase 3 — Feedback boards + triage inbox + push to roadmap + LoopedIn CSV import
  5. Phase 4 — Updates/changelog + subscribers + email
  6. Phase 5 — Knowledge base
  7. Phase 6 — Billing (Stripe) + widget + custom domains + white-label
  8. Later — SSO/SAML, API + webhooks, Jira, AI tagging, WordPress plugin

## Phase checklist
- [x] Research LoopedIn (public docs) — docs 00–13
- [x] Choose stack — doc 14
- [x] Live public audit — doc 15
- [x] Live admin audit — doc 16
- [x] Phase 0 — Scaffold (doc 17)
- [ ] Phase 1 — Accounts & workspaces
- [ ] Phase 2 — Roadmap + voting + public page + embed
- [ ] Phase 3 — Feedback + triage + import
- [ ] Phase 4 — Updates + email
- [ ] Phase 5 — Knowledge base
- [ ] Phase 6 — Billing, widget, domains, white-label

## Open questions
- Product name and app domain (not blocking).
- First commit/push to GitHub (owner's call; repo URL is set).
- Google OAuth credentials (optional for Phase 0).

## Session log
| Date | PC | Done | Next |
|------|----|------|------|
| 2026-10-27 | mahbubur (Mac) | LoopedIn research (docs 00–13), stack (14), public audit (15), admin audit (16), CLAUDE.md, scaffold plan (17), this file | Approve 17 + set up the git remote → start Phase 0 |
| 2026-10-27 | mahbubur (Mac) | Phase 0 scaffold built and verified: auth, onboarding, dashboard shell, queue/worker/email, widget, unit + e2e tests, deploy files, docs updated | First commit → write the Phase 1 plan (doc 18) for approval |
