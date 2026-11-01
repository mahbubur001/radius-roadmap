# 26 — Phase 6 plan: Billing, widget, custom domains, white-label

Status: **APPROVED 2026-11-01** (P1–P12 as recommended; order 6A → 6B → 6C → 6D; custom SMTP later). **6A being built.**

Phase 6 turns the product into something we can sell: paid plans with limits, the JavaScript widget, a customer's own domain, and branding. It is too large for one pass, so it is split into four sub-phases that can ship (and be committed) independently.

Sources:
- doc 11 (plans, prices, limits, feature gates)
- doc 07 §3 (widget: sidebar / popover, config, JS API, custom selector, CSP)
- doc 09 (branding, custom domain via CNAME, "Powered by", fonts, dark mode)
- doc 14 (Stripe; Caddy on-demand TLS + `/api/internal/domain-check`; widget = Preact + Vite → `public/widget.js`, < 15 KB gz, Shadow DOM; customer SSO = HS256 JWT verified with `jose`)
- doc 18 §2 (`getPlanLimits` hook already wired into workspace creation and invites; account deletion deferred to Phase 6)

What exists today:
- `src/server/services/plan-limits.ts` returns unlimited; used by `workspaces.ts`, `invitations.ts`, `auth`.
- `widget/src/main.tsx`: skeleton (launcher + empty panel, `show/hide/toggle`, `selector`), builds to `public/widget.js`.
- `public/embed.js` + embed mode (iframe, auto-resize) from Phase 2.
- Workspace `logo` + jsonb `settings` (module switches, tab names). No account-level branding.
- `src/proxy.ts` routes by path only; `deploy/Caddyfile` serves only the app domain.
- `jose` is installed but unused (no customer SSO yet).

---

## 1. Sub-phases

| Sub-phase | What ships | Size | Depends on |
|-----------|-----------|------|-----------|
| **6A Billing + plan limits** | Plans in code, Stripe Checkout + Customer Portal, webhooks, `getPlanLimits` + `hasFeature` filled in, limits enforced on create, feature gates, Settings → Billing, upgrade prompts, account deletion | L | — |
| **6B Widget** | Real `widget.js`: Updates sidebar + popover (latest posts, unread badge, reactions), "Send feedback" (submit an idea), identify users (name/email, optional signed JWT), widget settings page with install snippet, widget API | L | 6A only for the Startup gate (can ship ungated first) |
| **6C Branding / white-label** | Account logo + favicon, brand colour, font, default theme (light/dark/system), hide "Powered by", applied to public pages, embeds, widget and emails | M | 6A for gates |
| **6D Custom domain** | One domain per account (CNAME), verification, Caddy on-demand TLS, proxy hostname → account, links/cookies/sitemaps on the custom domain | M | 6A for the Pro gate; best after 6C |

**Recommended order: 6A → 6B → 6C → 6D** (see P1).

---

## 2. Decisions needed (my recommendation first)

| # | Question | Recommendation | Alternative |
|---|----------|----------------|-------------|
| P1 | Which sub-phase first | **6A Billing**: every other sub-phase is gated by plan, and building the gates once avoids retrofitting them | 6B Widget first (most visible product value), gates added later |
| P2 | Plans and prices | **Copy doc 11**: Free $0 / Startup $12 / Pro $24 / Enterprise $40 per month, annual = 20% off. Plans defined in code (`src/lib/plans.ts`); Stripe prices found by **lookup key** (`startup_monthly`, `pro_yearly`, …) so no price ids in env | Our own prices / fewer tiers |
| P3 | Trial | **No trial at launch**: Free is the trial. Easy to add later (`trial_period_days` on Checkout) | 14-day Pro trial without a card |
| P4 | Stripe integration | **Hosted Checkout + Customer Portal** (upgrade, downgrade, cancel, card, invoices all on Stripe). Webhooks are the source of truth; idempotent by event id. New dependency: `stripe` (already listed in doc 14) | Stripe Elements inside our UI |
| P5 | What counts toward limits | Teammates = account members + pending invites. Workspaces, roadmaps, feedback boards counted **per account**. Updates feeds and knowledge bases are one per workspace, so they follow the workspace limit | Count per workspace |
| P6 | Over the limit after a downgrade | **Never delete or lock data.** Existing extras keep working; creating new ones is blocked with an upgrade prompt and a banner. Gated features switch off (e.g. custom domain falls back to the app domain, "Powered by" shows again) | Make extras read-only |
| P7 | Feature gates | doc 11 table, **except**: email notifications (team alerts, subscriber emails, follow emails) stay on every plan, since Phases 3–4 rely on them and they drive engagement. Gate list: Startup = logo, widget, embeds, comments, follows, reactions, custom categories; Pro = white-label, fonts, custom domain, hide "Powered by", social sign-in, password protection, webhooks/integrations (later); Enterprise = API, SSO, segmentation (later) | Exactly doc 11 (email notifications Pro-only) |
| P8 | Who manages billing | **Owner only** (admins see the plan and usage, not the buttons). Account deletion = owner only, cancels the subscription first | Owners and admins |
| P9 | Widget contents | **Updates** (latest published posts, unread badge, emoji reactions, link to the post) **+ "Send feedback"** form (creates an idea in the inbox). Sidebar and popover layouts. Ideas list and article search later | Updates only (exactly LoopedIn) / all modules |
| P10 | Widget user identity | `user: { name, email }` in the config is treated as an **unverified guest** (like the guest vote form). Optional `token` = HS256 JWT signed with a per-account widget secret (`jose`) → verified `tracked_user` (`kind: 'sso'`). The same secret later powers `?token=` on embeds and public pages | Trust name/email as-is (LoopedIn) |
| P11 | Custom domain shape | **One domain per account** (doc 09). On it, paths drop the account: `feedback.acme.com/<workspace>/roadmap`; a single-workspace account also gets `/` → its workspace. Customer adds a CNAME to `domains.<app-domain>`; we verify by resolving the CNAME, then Caddy issues the certificate on demand after `GET /api/internal/domain-check` says yes. Old `/<account>/…` URLs on the app domain 308 to the custom domain | Per-workspace domains |
| P12 | Fonts | **Curated list of ~15 Google Fonts**, loaded with a `<link>` on public pages only (dashboard keeps its font). No uploads | Any Google Font by name / uploaded font files |

---

## 3. Sub-phase 6A — Billing + plan limits

### Data model (migration `0011`)
- `account_billing`: account_id (PK, FK organization), plan `free | startup | pro | enterprise`, interval `month | year` (null on free), status (Stripe status: `active | past_due | canceled | …`), stripe_customer_id, stripe_subscription_id, current_period_end, cancel_at_period_end, updated_at. No row = Free.
- `stripe_events`: id (Stripe event id, PK), type, processed_at. Insert-first for idempotency.

### Code
- `src/lib/plans.ts`: plan list, prices, limits, features, `planIncludes(plan, feature)`.
- `src/server/services/billing.ts`: `getAccountPlan` (effective plan: `past_due` keeps the plan for Stripe's retry window, `canceled` → Free), `createCheckoutSession`, `createPortalSession`, `applyStripeEvent`. `plan-limits.ts` reads it; new `assertWithinLimit(ctx, 'roadmaps')` and `assertFeature(ctx, 'customDomain')` throw `ForbiddenError` with an "upgrade" code the UI turns into a prompt.
- `POST /api/webhooks/stripe`: verify signature (`STRIPE_WEBHOOK_SECRET`), record event, update `account_billing` from `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.payment_failed`. Heavy follow-ups (emails) go to a BullMQ job.
- Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_ENABLED` (billing UI hidden and everything unlimited when unset, so dev and self-hosting work without Stripe).
- Enforcement points: workspace create, invites, roadmap create/duplicate/copy, feedback board create; feature switches in Public site settings (comments, follows, reactions, embed) show a lock + "Upgrade" when the plan lacks them, and public pages ignore a gated switch.
- UI: **Settings → Billing** (current plan, usage bars vs limits, monthly/annual toggle, plan cards, "Manage billing" → Portal, past-due banner); upgrade dialog reused wherever a limit is hit; **Settings → Account → Delete account** (owner, type the name, cancels Stripe, deletes the organization; uploads removed by a job).
- Emails: payment failed, subscription cancelled (to owners).

### Tests
- Unit: limits per plan, gates, effective plan from Stripe statuses, webhook idempotency (same event twice), tenant isolation (can't open another account's portal).
- e2e: Free account hits the roadmap limit → upgrade prompt; with Stripe test mode keys (skipped when absent) Checkout → webhook → Pro.

## 4. Sub-phase 6B — Widget

- **Install snippet** (Settings → Widget): `<script>window.rrWidget = { site: "<account>", workspace: "<slug>", type: "sidebar" }</script><script async src="https://<app>/widget.js"></script>`; JS API `RadiusRoadmap.widget.init|show|hide|toggle`, `auto_init`, custom `selector` (doc 07).
- **Settings** (workspace jsonb, no migration): type sidebar/popover, launcher colour, header colour, launcher icon (bell or logo), show logo, reactions on/off, feedback on/off, launcher position.
- **API** (`src/app/api/widget/*`, CORS `*` for GET, credentials-free; visitor id via `x-rr-visitor` like embeds): `GET config + latest posts` (cached per workspace, invalidated with `invalidatePublic`), `POST reactions` (reuses the reactions service), `POST feedback` (reuses public idea submission, Turnstile skipped for verified tokens, rate-limited), `POST identify` (JWT → tracked user, P10).
- **Unread badge:** last-seen post timestamp in `localStorage`, no server state.
- **Widget bundle:** Preact, Shadow DOM, CSS variables from settings, < 15 KB gz (CI check on size), no `src/` imports except types.
- `public/widget-test.html` updated; e2e: snippet on a test page → open → see post → react → send feedback → idea in the inbox.
- Widget views counted as `widget_view` events (Home tile).
- Docs page in the dashboard: install, SPA usage, CSP allowlist (`script-src`/`connect-src` app domain).

## 5. Sub-phase 6C — Branding / white-label

- Account-level `branding` jsonb on a new `account_settings` table (migration): logo, favicon, brand colour, font, default theme, hide "Powered by". Workspace logo stays as an override (existing).
- Public layout sets CSS variables (`--primary` + foreground computed for contrast), favicon, font `<link>` (P12), theme default for `next-themes`.
- "Powered by Radius Roadmap" footer on public pages, embeds, widget and subscriber emails; hidden on Pro when switched off.
- Emails (React Email) use the logo + brand colour.
- Gates: logo = Startup; colour/font/hide "Powered by" = Pro.
- `invalidateSite(accountId)` on every change.

## 6. Sub-phase 6D — Custom domain

- `custom_domains` table (migration): account_id (unique, P11), hostname (unique, lowercased), status `pending | active | failed`, verified_at, last_checked_at, error.
- Settings → Domain: enter hostname → instructions (CNAME target) → "Verify" (DNS lookup in a job, retried for 48 h) → active. Remove domain.
- `GET /api/internal/domain-check?domain=` (only answers Caddy on localhost): 200 when the hostname is active and the account's plan includes it.
- `src/proxy.ts`: hostname ≠ app domain → look up the account (small LRU cache, invalidated on change) → rewrite `/<workspace>/…` to `sites/[account]/…`; dashboard and auth routes 404 on custom domains; `publicPathStatus` works the same.
- Links, redirects, emails, RSS, sitemap, canonical URLs use the account's public origin (`siteOrigin` learns it). Voter cookies are host-only, so they work per domain unchanged; magic links go to the domain the visitor started on.
- `deploy/Caddyfile`: `on_demand_tls { ask http://localhost:3000/api/internal/domain-check }` + a catch-all `https://` site block; rate limits on issuance.
- Tests: hostname mapping, domain-check (inactive, downgraded, other account), 308 from the app-domain path when a domain is active. Local e2e via `/etc/hosts`-free approach: Playwright sends a `Host` header override against the dev server.

---

## 7. Not in Phase 6
- Agency plan / sub-accounts, coupons UI (Stripe Portal handles promo codes), usage-based pricing, tax (Stripe Tax can be switched on later without code changes).
- Public API + webhooks, SSO/SAML for team members, Jira, AI tagging, WordPress plugin (Later list).
- Custom SMTP per account (doc 09) — **open: Phase 6C or later?** Recommend later.
- Translations / multi-language, password-protected public sites (Pro gate exists; feature later), custom CSS.

## 8. Steps (each: tests, lint, typecheck, commit)
Steps for the first approved sub-phase get numbered here once P1 is decided. Draft for 6A:
1. Plans config + `account_billing`/`stripe_events` migration + `billing.ts` + limits/gates in services, tests.
2. Stripe Checkout, Portal, webhook route, emails job; env vars.
3. Settings → Billing UI, upgrade dialog, locks on gated switches, banners.
4. Account deletion.
5. e2e + docs ("As built"), PROGRESS.

## 9. Done when (6A)
- [ ] An owner can upgrade, change interval, downgrade and cancel through Stripe; the app follows within one webhook.
- [ ] Limits and gates hold on the server for every create path (tests), with an upgrade prompt in the UI.
- [ ] No Stripe keys ⇒ everything unlimited, no billing UI.
- [ ] An owner can delete the account.
- [ ] Checks green (unit, e2e, lint, typecheck, build).
