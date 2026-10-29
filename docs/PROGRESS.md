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
- Roadmap admin redesign (LoopedIn layout, attachments, comments, follow, export; approved + built 2026-10-29): `docs/21-roadmap-admin-redesign.md`
- Public site redesign + "Objective" naming (approved + steps 1–4 built 2026-10-29): `docs/22-public-site-redesign.md`
- Phase 4 plan (Updates, subscribers, emails; approved 2026-10-29, steps 1–2 built): `docs/23-phase-4-plan.md`
- Stack versions as built: `docs/14-dev-tools.md` → "Versions as built"

## Current status
- **Phase:** Phases 0 and 1 done. **Phase 2:** everything built except step 10 (LoopedIn roadmap import, waiting for the export file). **Phase 3 (doc 20, approved 2026-10-28):** steps 1–4 of doc 20 §7 built, tested and pushed; step 5 (public feedback pages) is next.
- **2026-10-29, LoopedIn-style admin UI** (doc 21 + this session): collapsible blue/charcoal sidebar; feedback list with board tabs and cards; roadmap board with filters panel and objective quick-picker; two-pane card drawer with rail actions (duplicate, move/copy to any roadmap, follow); card attachments (images + PDF), team comments, CSV export. Migration `0005`.
- **Phase 3 delivered so far** (details in doc 20 "As built"):
  - Schema + migrations `0003` (feedback boards, statuses, items, links, comments, follows, notification preferences; `votes.feedback_id`) and `0004` (defaults for existing workspaces).
  - Admin feedback list at `/dashboard/<workspace>/feedback` (filters in the URL, sort, search) + drawer (autosave, Impact/Effort priority).
  - Triage inbox (`/feedback/inbox`), sidebar badge, bulk actions, keyboard shortcuts, board settings, statuses editor.
  - Push to roadmap / link to card, Linked feedback tab on cards, 💡 counts, card → feedback status sync, merge, duplicate.
  - Playwright: `e2e/feedback.spec.ts` (3 flows).
- **Phase 2 delivered so far:**
  - Schema + migration `0002`: roadmaps, columns, cards (full-text search), features, categories, tags, votes, events, voter login codes. New workspaces are seeded with a roadmap, columns and categories.
  - Admin board (dnd-kit, fractional ordering), roadmap settings, columns editor, categories/tags, card drawer (Tiptap with image upload, autosave, features, Votes tab).
  - Public site at `localhost:3000/<account>/<workspace>/roadmap` (moved from subdomains 2026-10-28, doc 19 "D1 revised"; dashboard now at `/dashboard/<workspace>`): server-rendered, cached, card pages, search, SEO (metadata, sitemap.xml, robots.txt).
  - Voting: anonymous (signed visitor cookie), guest, email code / magic link; rate limits; Turnstile (optional); visitor votes claimed on sign-in.
  - Embed: `public/embed.js` + embed mode + Public settings page.
  - Home dashboard v1 (stat tiles, views chart, recent votes, most voted).
  - Shared form components: `DatePicker`/`DateRangePicker`, `ColorPicker`, `RichTextEditor`; chart: `ColumnChart`.
  - Real 404 / 308 statuses for public sites, checked in `src/proxy.ts` (`publicPathStatus`).
  - Playwright flows 1–5 (`e2e/roadmap.spec.ts`).
- Rate-limit bypass fixed: `cf-*` headers trusted only with `TRUST_CLOUDFLARE=1` (new env var); `src/server/rate-limit.test.ts`.
- **Checks:** `pnpm lint`, `typecheck`, `test` (173 tests), `test:e2e` (24 tests in `e2e/roadmap.spec.ts`, `feedback.spec.ts`, `ideas.spec.ts`, `team.spec.ts`) and `build` pass.
- **Git:** doc 21 work is committed locally on `main` (sidebar `668679c`, step A `e853923`, step B `92ae9fa`, step C + docs after it). **Not pushed yet.**
- **Dev tip:** Turbopack's dev cache sometimes serves stale code after edits (seen twice: CSS and a new service export). If a change doesn't show up, stop `pnpm dev`, delete `.next/dev`, and start it again.
- **Dev test account on this Mac:** `claude-dev@example.test` / `devpassword123` (account `claude-dev`, workspace `dev-product`). Local dev DB only.
- **Second Mac (user `radiustheme`):** set up 2026-10-28. Homebrew Postgres 18 (role `radiustheme`, no `postgres` role, so `DATABASE_URL=postgres://radiustheme@localhost:5432/radius_roadmap`) + Redis. `~/.zshrc` has `PNPM_HOME=/Users/mahbubur/...` copied from the first Mac, so pnpm (and the lefthook pre-commit hook) fails with EACCES until it's fixed to `$HOME/Library/pnpm` (workaround: prefix commands with `PNPM_HOME=$HOME/Library/pnpm`). Playwright Chromium installed 2026-10-28.
- **First Mac (user `mahbubur`):** Homebrew Postgres 18 + Redis, `EMAIL_TRANSPORT=console`, `STORAGE_DRIVER=local` in `.env.local` (its `PUBLIC_ROOT_DOMAIN` line is no longer used and can be deleted). The dev workspace `demo-product` was renamed "Radius Roadmap" (slug unchanged). The local dev DB also holds many test accounts made by Playwright; they're harmless.

## Next step
Resume here. On a new session say: *"Read docs/PROGRESS.md and continue from Next step."*
1. **Phase 4 (doc 23, approved 2026-10-29), step 5:** email each published post to active subscribers (batched fan-out on the `notify` queue → email queue, idempotent per post + subscriber, `emailed_at` set once, rate-limited email queue, `List-Unsubscribe` + `List-Unsubscribe-Post` headers, suppressions respected). Steps 1–4 are done. Then steps 6–7 (follow emails, reactions + Home tiles). **Rule learned:** anything the worker imports must not import `server-only` (guarded by `src/test/worker-imports.test.ts`).
2. **Owner (blocking for the imports):** export from LoopedIn and put both files in `docs/samples/`: the roadmap (Roadmap → More → Export) and the feedback (Boards → More → Export).
3. With the exports: Phase 2 step 10 (LoopedIn roadmap import at `/dashboard/<workspace>/roadmap/import?r=<roadmap-slug>`: papaparse, preview step, idempotent by `external_ref`, totals into `imported_votes`, Vitest + Playwright flow 6), then Phase 3 step 9 (feedback import + CSV export). Tick doc 19 "Done when" and mark Phase 2 done.
4. Open follow-ups: a strict Content-Security-Policy on public pages (they now share the dashboard's origin, doc 19 "D1 revised"); optional redirect from old dashboard URLs `/<workspace>/…` to `/dashboard/<workspace>/…`.

## Decisions (approved)
- **2026-10-28, owner: public pages on the app domain, LoopedIn-style** (`<app>/<account>/<workspace>`), dashboard under `/dashboard/<workspace>`, account subdomains removed. Replaces doc 19 D1; details in doc 19 "D1 revised".
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
- [ ] Phase 3 — Feedback + triage + import (steps 1–8 built; step 9 import waits for the LoopedIn export)
- [x] Roadmap admin redesign — doc 21 (steps A–C)
- [ ] Phase 4 — Updates + email (doc 23; steps 1–4 of 7 built)
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
| 2026-10-28 | radiustheme (Mac 2) | Phase 3 steps 1–3 (schema, feedback list + drawer, triage inbox + bulk + boards/statuses); public pages moved to `/<account>/<workspace>`, dashboard to `/dashboard/<workspace>` (owner decision, doc 19 "D1 revised") | Phase 3 step 4 (push to roadmap, merge); LoopedIn exports still needed |
| 2026-10-28 | radiustheme (Mac 2) | Phase 3 step 4: push to roadmap, links both ways, status sync, merge, duplicate, 💡 counts (120 unit + 14 e2e passing) | Phase 3 step 5 (public feedback pages) |
| 2026-10-29 | radiustheme (Mac 2) | LoopedIn-style admin UI: sidebar, feedback list, roadmap board + filters, card drawer rail; doc 21 approved and built (attachments, team comments, follow, duplicate/move/copy, CSV export; migration 0005); 133 unit + 17 e2e passing | Push; then Phase 3 step 5 (public feedback pages) |
| 2026-10-29 | radiustheme (Mac 2) | Public site analysis + plan (doc 22) approved; step 1: categories → objectives everywhere (migration 0006, run `pnpm db:migrate`) | Doc 22 step 2 (public shell) |
| 2026-10-29 | radiustheme (Mac 2) | Doc 22 steps 2–4: public header tabs + Public site switches + legal links; public roadmap restyle; public Ideas page with submission, voting, inbox review, 308 for merged ideas (doc 20 steps 5–6). 144 unit + 20 e2e passing | Phase 3 step 7 (public comments + follows) |
| 2026-10-29 | radiustheme (Mac 2) | Phase 3 step 7: public comments on ideas + cards (approval, team replies, internal notes, moderation page), idea follows (auto on vote/submit), Public settings switches; shared comments service replaces card-only comments. 147 unit + 21 e2e | Phase 3 step 8 (notification emails) |
| 2026-10-29 | radiustheme (Mac 2) | Phase 3 step 8: team email alerts (new idea, new comment; instant / daily digest / off per member), notify queue + daily scheduler, Settings → Notifications. 152 unit + 21 e2e | Phase 4 plan (Updates) |
| 2026-10-29 | radiustheme (Mac 2) | Fixes: one tab underline, team vote from the card drawer, dashboard max width 1500px. Phase 4 plan (doc 23) approved; steps 1–2: updates schema `0007` + default categories, admin Updates list, editor, categories, Announce from cards. 161 unit + 22 e2e | Phase 4 step 3 (publish + public Updates) |
| 2026-10-29 | radiustheme (Mac 2) | Phase 4 step 3: publish / schedule / unpublish (delayed job + signed revalidate from the worker), public Updates tab, post pages, RSS, sitemap, Updates switch; worker import guard test. 168 unit + 23 e2e | Phase 4 step 4 (subscribers) |
| 2026-10-29 | radiustheme (Mac 2) | Phase 4 step 4: update subscribers (double opt-in, scanner-safe unsubscribe + one-click, suppressions, admin list + CSV, "New subscribers" alert). 173 unit + 24 e2e | Phase 4 step 5 (post emails) |
