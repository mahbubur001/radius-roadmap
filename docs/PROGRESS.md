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
- Phase 1 plan (built): `docs/18-phase-1-plan.md`
- Phase 2 plan (draft, awaiting approval): `docs/19-phase-2-plan.md`
- Stack versions as built: `docs/14-dev-tools.md` → "Versions as built"

## Current status
- **Phase:** Phase 0 done. **Phase 1 built 2026-10-27**; every item in doc 18's "Done when" list passes. Committed and pushed (`b546e7f`).
- **Phase 1 delivered:**
  - Workspace switcher with create, rename/re-slug and delete; account switcher; remembers the last workspace.
  - Team page: invite with role and workspaces; resend/cancel invites; change role; edit workspace access; remove member; transfer ownership; leave account.
  - Per-member workspace access.
  - Profile (name, photo, change email with approval from the current address, password, sign out other devices); account and workspace settings with logo uploads.
  - Storage layer (local + S3).
  - `tracked_users` + voter sessions (service only).
  - Migration `0001`.
- **Checks:** `pnpm lint`, `typecheck`, `test` (57 tests), `test:e2e` (6 tests: smoke, invite → member sees only granted workspace, rename/delete, avatar upload, change email, disabled endpoints) and `build` all pass.
- **Git:** Phases 0 and 1 are pushed to `origin/main` (latest `b546e7f`).
- **This Mac:** Homebrew Postgres 18 + Redis, `EMAIL_TRANSPORT=console`, `STORAGE_DRIVER=local`. The local dev DB now also holds many `e2e-*`/`owner-*@example.test` accounts made by Playwright; they're harmless.

## Next step
1. Owner: review **`docs/19-phase-2-plan.md`** and answer decisions D1–D6 in its §2.
2. Owner: export the Radius roadmap from LoopedIn (Roadmap → More → Export) and put the file in `docs/samples/` (needed for the importer, D4).
3. After approval, build Phase 2 in the order of doc 19 §7.

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
- Phase 1 decisions (doc 18 §2, approved 2026-10-27):
  - per-member workspace access
  - uploads now (local + S3 drivers)
  - change email in Phase 1
  - password minimum 10 characters
  - owners and admins invite; only an owner manages owners
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
- [x] Phase 1 — Accounts & workspaces (doc 18)
- [ ] Phase 2 — Roadmap + voting + public page + embed
- [ ] Phase 3 — Feedback + triage + import
- [ ] Phase 4 — Updates + email
- [ ] Phase 5 — Knowledge base
- [ ] Phase 6 — Billing, widget, domains, white-label

## Open questions
- Product name and app domain (not blocking).
- Google OAuth credentials (optional for Phase 0).

## Session log
| Date | PC | Done | Next |
|------|----|------|------|
| 2026-10-27 | mahbubur (Mac) | LoopedIn research (docs 00–13), stack (14), public audit (15), admin audit (16), CLAUDE.md, scaffold plan (17), this file | Approve 17 + set up the git remote → start Phase 0 |
| 2026-10-27 | mahbubur (Mac) | Phase 0 scaffold built and verified: auth, onboarding, dashboard shell, queue/worker/email, widget, unit + e2e tests, deploy files, docs updated | First commit → write the Phase 1 plan (doc 18) for approval |
| 2026-10-27 | mahbubur (Mac) | Committed + pushed Phase 0; wrote the Phase 1 plan (doc 18) | Doc 18 approved (all recommendations) → build Phase 1 |
| 2026-10-27 | mahbubur (Mac) | Phase 1 built and tested (doc 18): workspaces, team/invites, workspace access, settings, uploads, voter model | Owner reviews + commits → Phase 2 plan (doc 19) |
| 2026-10-27 | mahbubur (Mac) | Committed + pushed Phase 1; wrote the Phase 2 plan (doc 19) | Owner approves doc 19 (D1–D6) + sends the LoopedIn export → build Phase 2 |
