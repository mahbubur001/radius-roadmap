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
- Phase 2 plan (approved, being built; see its "As built" section): `docs/19-phase-2-plan.md`
- Phase 3 plan (approved 2026-10-28, being built): `docs/20-phase-3-plan.md`
- Stack versions as built: `docs/14-dev-tools.md` → "Versions as built"

## Current status
- **Phase:** Phases 0 and 1 done and pushed. **Phase 2 approved 2026-10-27 (D1–D6, all recommendations); steps 1–9 and 11 of doc 19 §7 are built, tested and pushed.** Only step 10 (LoopedIn import) is left.
- **Phase 2 delivered so far:**
  - Schema + migration `0002`: roadmaps, columns, cards (full-text search), features, categories, tags, votes, events, voter login codes. New workspaces are seeded with a roadmap, columns and categories.
  - Admin board (dnd-kit, fractional ordering), roadmap settings, columns editor, categories/tags, card drawer (Tiptap with image upload, autosave, features, Votes tab).
  - Public site at `<account>.localhost:3000/<workspace>/roadmap`: server-rendered, cached, card pages, search, SEO (metadata, sitemap.xml, robots.txt).
  - Voting: anonymous (signed visitor cookie), guest, email code / magic link; rate limits; Turnstile (optional); visitor votes claimed on sign-in.
  - Embed: `public/embed.js` + embed mode + Public settings page.
  - Home dashboard v1 (stat tiles, views chart, recent votes, most voted).
  - Shared form components: `DatePicker`/`DateRangePicker`, `ColorPicker`, `RichTextEditor`; chart: `ColumnChart`.
  - Real 404 / 308 statuses for public sites, checked in `src/proxy.ts` (`publicPathStatus`).
  - Playwright flows 1–5 (`e2e/roadmap.spec.ts`).
- Rate-limit bypass fixed: `cf-*` headers trusted only with `TRUST_CLOUDFLARE=1` (new env var); `src/server/rate-limit.test.ts`.
- **Checks:** `pnpm lint`, `typecheck`, `test` (98 tests), `test:e2e` (11 tests, incl. Phase 2 flows 1–5 in `e2e/roadmap.spec.ts`) and `build` pass.
- **Git:** everything is pushed to `origin/main`. Latest code commit `a280db4` (Playwright flows, embed height fix, proxy 404s); the commit after it only updates this file.
- **Second Mac (user `radiustheme`):** set up 2026-10-28. Homebrew Postgres 18 (role `radiustheme`, no `postgres` role, so `DATABASE_URL=postgres://radiustheme@localhost:5432/radius_roadmap`) + Redis. `~/.zshrc` has `PNPM_HOME=/Users/mahbubur/...` copied from the first Mac, so pnpm fails with EACCES until it's fixed to `$HOME/Library/pnpm`.
- **First Mac (user `mahbubur`):** Homebrew Postgres 18 + Redis, `EMAIL_TRANSPORT=console`, `STORAGE_DRIVER=local`, `PUBLIC_ROOT_DOMAIN=localhost:3000` in `.env.local`. The dev workspace `demo-product` was renamed "Radius Roadmap" (slug unchanged). The local dev DB also holds many test accounts made by Playwright; they're harmless.

## Next step
Resume here. On a new session say: *"Read docs/PROGRESS.md and continue from Next step."*
1. ~~Fix the rate-limit bypass~~ (done 2026-10-28).
2. **Owner (blocking):** export the Radius roadmap from LoopedIn (Roadmap → More → Export) and put the file in `docs/samples/`.
3. Then build **step 10**, the LoopedIn import page at `/<workspace>/roadmap/import?r=<roadmap-slug>` (papaparse, preview step, idempotent by `external_ref`, totals into `imported_votes`), its Vitest test and Playwright flow 6.
4. Tick the last "Done when" items in doc 19, mark Phase 2 done here, commit + push.
5. **Phase 3 approved 2026-10-28 (D1–D7, all recommendations).** Build doc 20 §7 steps 1–8 while waiting for the exports. D7 also needs the LoopedIn **feedback** export (Boards → More → Export) in `docs/samples/`.

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
- [ ] Phase 2 — Roadmap + voting + public page + embed (all built except step 10, LoopedIn import)
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
| 2026-10-27 | mahbubur (Mac) | Committed + pushed doc 19; doc 19 approved; built Phase 2 steps 1–9 (schema, board, card drawer, public site, voting, voter sign-in, embed, Home dashboard), shared DatePicker/ColorPicker, 90 tests passing | LoopedIn export → import (step 10), Playwright flows, commit + push |
| 2026-10-28 | mahbubur (Mac) | Pushed Phase 2 steps 1–9 (`f7703a7`); Playwright flows 1–5 (11 e2e passing); fixed embed iframe height ; real 404/308 for public pages via the proxy (owner approved); pushed `a280db4` | Fix cf-connecting-ip rate-limit bypass + rate-limit test → LoopedIn export → step 10 |
| 2026-10-28 | radiustheme (Mac 2) | First-time setup on this Mac; fixed the cf-connecting-ip rate-limit bypass (`TRUST_CLOUDFLARE`), added rate-limit tests (98 passing) ; button cursor fix (Tailwind v4 Preflight); wrote the Phase 3 plan (doc 20), approved | LoopedIn exports → Phase 2 step 10; build Phase 3 steps 1–8 |
