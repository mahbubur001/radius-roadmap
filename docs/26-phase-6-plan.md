# 26 — Phase 6 plan: Billing, widget, custom domains, white-label

Status: **APPROVED 2026-11-01** (P1–P12 as recommended; order 6A → 6B → 6C → 6D; custom SMTP later). **6A and 6B built 2026-11-01** (see "As built"); **6C built 2026-11-01** (B1–B7 approved; see §13); **6D built 2026-11-01** (D1–D9 approved; see §14). **Phase 6 done.**

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

### 6C decisions — **approved 2026-11-01 (all as recommended)**

| # | Question | Recommendation | Alternative |
|---|----------|----------------|-------------|
| B1 | Branding level | **Account-level** (one brand for all workspaces, doc 09). Workspace logo stays as an override; nothing else per workspace | Full branding per workspace |
| B2 | Default theme | **Per workspace, as today**, but the existing `darkModeDefault` switch becomes `theme: light \| dark \| system` (old `true` → `dark`). Account-level default would duplicate it | Move it to the account |
| B3 | Brand colour scope | `--primary`, `--ring` and accent tab underline on public pages (light + dark), embeds, widget launcher/header **default** (widget's own colours still win when set), email buttons. Foreground (white / near-black) computed from luminance; Settings warns when contrast with white < 3:1 | Separate colours per surface |
| B4 | Which emails get branded | Emails a tenant's **end users** receive (subscriber posts, double opt-in, follow/status, voter sign-in codes, completion): account logo, brand colour, "Powered by" footer. **Team** emails (auth, invites, alerts, billing) keep Radius Roadmap branding | Brand all emails |
| B5 | Favicon | Upload PNG / ICO / SVG, ≤ 256 KB, square; falls back to the account logo, then to our icon | Generate from the logo |
| B6 | Fonts (P12) | ~15 curated Google Fonts in `src/lib/fonts.ts` (Inter default, plus e.g. Roboto, Open Sans, Lato, Poppins, Montserrat, Nunito, Source Sans 3, Work Sans, DM Sans, Manrope, IBM Plex Sans, Merriweather, Lora, Playfair Display). One `<link>` with `display=swap`; widget uses the font too; emails keep a web-safe stack | Self-host fonts |
| B7 | Downgrade (P6) | Stored values are kept; `effectiveBranding()` drops what the plan lacks (colour/font → defaults, "Powered by" shows again, logo → initials on Free) | Clear the values |

### 6C data
- Migration `0013`: `account_settings` (account_id PK → organization, cascade; `branding` jsonb `{ favicon?, color?, font?, hidePoweredBy? }`; updated_at). The account logo already exists (`organization.logo`, `setAccountLogo` in `services/accounts.ts`) and is reused, not duplicated. Favicon keys under a new `prefixes.accountFavicon(accountId)` (like `accountLogo`), checked with `keyHasPrefix`.
- Workspace settings jsonb: `theme` replaces `darkModeDefault` (read both, write `theme`).

## 6. Sub-phase 6D — Custom domain

- `custom_domains` table (migration): account_id (unique, P11), hostname (unique, lowercased), status `pending | active | failed`, verified_at, last_checked_at, error.
- Settings → Domain: enter hostname → instructions (CNAME target) → "Verify" (DNS lookup in a job, retried for 48 h) → active. Remove domain.
- `GET /api/internal/domain-check?domain=` (only answers Caddy on localhost): 200 when the hostname is active and the account's plan includes it.
- `src/proxy.ts`: hostname ≠ app domain → look up the account (small LRU cache, invalidated on change) → rewrite `/<workspace>/…` to `sites/[account]/…`; dashboard and auth routes 404 on custom domains; `publicPathStatus` works the same.
- Links, redirects, emails, RSS, sitemap, canonical URLs use the account's public origin (`siteOrigin` learns it). Voter cookies are host-only, so they work per domain unchanged; magic links go to the domain the visitor started on.
- `deploy/Caddyfile`: `on_demand_tls { ask http://localhost:3000/api/internal/domain-check }` + a catch-all `https://` site block; rate limits on issuance.
- Tests: hostname mapping, domain-check (inactive, downgraded, other account), 308 from the app-domain path when a domain is active. Local e2e via `/etc/hosts`-free approach: Playwright sends a `Host` header override against the dev server.

### 6D decisions — **approved 2026-11-01** (D1 = option 1: customer-owned domains; D2–D9 as recommended)

| # | Question | Recommendation | Alternative |
|---|----------|----------------|-------------|
| D1 | Which domains | **The customer's own domain**, a host under a domain they own (`feedback.acme.com`), pointed at us with a CNAME to `CUSTOM_DOMAIN_TARGET`. **Never subdomains of our app domain** (account subdomains stay removed, doc 19 "D1 revised"). Root domains (`acme.com`) can't have a CNAME: later, with an A record | Root domains too, from day one |
| D2 | Proving ownership | **TXT record + CNAME.** The customer adds `_radius-roadmap.<host>` TXT = a token unique to the account and domain. A CNAME alone isn't proof: once Acme points `feedback.acme.com` at us, any other account could claim it first | CNAME only (LoopedIn) |
| D3 | `domain-check` for Caddy | **Public `GET /api/domain-check?domain=`**, answers only 200/404, rate-limited. Whether a domain points at us is public in DNS anyway, and it avoids trusting "localhost" behind a proxy | Shared secret / localhost only |
| D4 | Verification timing | "Verify now" button checks DNS once (5 s timeout). A worker job re-checks pending domains every 10 min for 48 h (then `failed`, can retry), and active ones daily: 3 failed days in a row → `failed`. Owners get an email when the domain goes live and when it stops working | Manual only |
| D5 | Canonical URL | Once active, **the custom domain is the only public URL**: app-domain public pages 308 to it (query kept). Embeds (`?embed=1`), the widget and `/api/*` stay on the app domain | Serve both, canonical tag only |
| D6 | Downgrade / removal (P6) | The domain row is kept but inactive: the custom host 308s back to the app-domain URL (old links keep working while the certificate lasts), `domain-check` says no, app domain stops redirecting | Show an error page on the custom host |
| D7 | What a custom host serves | Only the public site, `/api/public/*`, `/api/files/*` and Next assets. Dashboard, auth, `/api/auth`, other API routes and server actions → 404, so no app session cookie can be set on a customer's domain | Everything |
| D8 | Voter sign-in | Per domain (cookies are host-only, as today). Someone signed in on the app domain signs in again on the custom domain; fine because D5 sends everyone to one domain | Cross-domain session handoff |
| D9 | Switching it on | Off unless `CUSTOM_DOMAIN_TARGET` is set (like Stripe). In development, `*.localhost` hosts verify without DNS (Chrome resolves them to 127.0.0.1), which also drives the e2e test; never in production | Always on |

### 6D data
- Migration `0014`: `custom_domains` (id, account_id unique → organization cascade, hostname unique lowercased, status `pending | active | failed`, verify_token, verified_at, last_checked_at, failures int, error text, created_at).

---

## 7. Not in Phase 6
- Agency plan / sub-accounts, coupons UI (Stripe Portal handles promo codes), usage-based pricing, tax (Stripe Tax can be switched on later without code changes).
- Public API + webhooks, SSO/SAML for team members, Jira, AI tagging (Later list).
- Custom SMTP per account (doc 09) — **open: Phase 6C or later?** Recommend later.
- Translations / multi-language, password-protected public sites (Pro gate exists; feature later), custom CSS.

## 8. Steps (each: tests, lint, typecheck, commit)
6A (built):
1. Plans config + `account_billing`/`stripe_events` migration + `billing.ts` + limits/gates in services, tests.
2. Stripe Checkout, Portal, webhook route, emails job; env vars.
3. Settings → Billing UI, upgrade dialog, locks on gated switches, banners.
4. Account deletion.
5. e2e + docs ("As built"), PROGRESS.

6B (built 2026-11-01):
1. **Schema + settings:** migration `0012` (`widget_keys` per account; `widget` added to the feedback/vote sources, `widget_view` event). Widget settings in the workspace `settings` jsonb (`widget`: layout, position, colours, reactions, feedback). **Settings → Widget** page: install snippet, options, signing key (show/rotate). Plan gate `widget`.
2. **Widget API** (`/api/widget/*`, CORS `*`, no cookies; visitor id in `x-rr-visitor`, identity token in `x-rr-token`): `GET config` (workspace, settings, latest posts, own reactions), `GET posts/<slug>` (body), `POST reactions`, `POST feedback` (to the triage inbox unless the token is verified), `POST view`. Services + tenant tests.
3. **Bundle** `public/widget.js`: Preact in Shadow DOM, sidebar + popover, launcher (bell / custom selector), unread badge (`localStorage`), post list → post view, reactions, "Send feedback" form, JS API `RadiusRoadmap.init/show/hide/toggle`, < 15 KB gz check.
4. **Views + e2e:** `widget_view` events + Home tile; Playwright: test page with the snippet → open → post → react → feedback lands in the inbox.
5. **Docs:** "As built", PROGRESS.

6C (approved + built 2026-11-01, §13):
1. **Schema + service:** migration `0013` (`account_settings`), `src/lib/schemas/branding.ts` (Zod: hex colour, font id from the list, upload keys), `src/lib/fonts.ts`, `src/lib/color.ts` (luminance → foreground, contrast ratio), `src/server/services/branding.ts` (`getBranding`, `updateBranding` owner/admin only with gates per field, `effectiveBranding(plan)`), `invalidateSite` on save. Tests: tenant isolation, gates per field, downgrade fallback, colour maths.
2. **Settings → Branding** (account section, owner/admin): logo (moves here from Account settings, same storage) + favicon upload, `ColorPicker` with contrast warning, font select (rendered in each font), "Show Powered by" switch, locks + upgrade toast for gated fields, small live preview (header, tab, button). Workspace settings: theme select Light / Dark / System.
3. **Public sites + embeds:** `loadSite` returns effective branding; site root sets `--primary`, `--primary-foreground`, `--ring` (light + dark) inline; font `<link>` + `font-family` on the site root; favicon via `icons` in the public layout metadata; header logo = workspace logo → account logo → initials; footer hidden when "Powered by" is off; `next-themes` default from `theme`.
4. **Widget + emails:** widget config gets `brand { color, font, poweredBy }` (widget colours default to the brand colour); widget footer obeys it; bundle size check still < 15 KB gz. `EmailLayout` takes an optional `brand { name, logoUrl, color, poweredBy }`; end-user emails (B4) pass the account's effective branding.
5. **e2e + docs:** Playwright: Pro account sets colour + font + hides "Powered by" → public page shows them (computed style), downgrade → defaults return; Free sees locks. "As built", PROGRESS.

6D (approved + built 2026-11-01, §14):
1. **Schema + service:** migration `0014`, env `CUSTOM_DOMAIN_TARGET` (optional), `src/lib/schemas/domain.ts` (hostname: lowercase FQDN, ≥ 3 labels, not an IP, not the app domain or its subdomains, no `localhost` in production), `src/server/services/custom-domains.ts`: `getDomain`, `setDomain` (owners/admins, Pro gate, new token), `removeDomain`, `verifyDomain` (DNS resolver injected for tests: TXT token + CNAME target), `activeDomainForHost` (plan-gated), `publicOrigin(accountId)` (custom domain if active, else app domain; worker-safe). Tests: tenant isolation, hostname rules, unique across accounts, TXT/CNAME outcomes, gate + downgrade.
2. **Settings → Domain** (account section): enter hostname → the two DNS records with copy buttons → status badge (pending / active / failed + reason) → Verify now / Remove. Worker job `verify-domains` on a 10-minute scheduler (D4) + owner emails (`domain-active`, `domain-failed`).
3. **Routing:** proxy matcher also covers `/api`; app host + `/api` → straight through. Custom host → `activeDomainForHost` (60 s in-process cache) → D7 allow-list, `/<module>` + `/<workspace>/<module>` rewritten to `sites/<account>/…` (default-workspace short URLs work the same), `/` → site root; inactive → 308 to the app-domain URL (D6). App-domain public pages 308 to the active custom domain (D5). Request header `x-rr-site-prefix` (`""` on a custom host, `/<account>` on the app domain) tells pages how to build links. `GET /api/domain-check` (D3).
4. **Links:** public pages build links from `sitePrefix()` instead of `/${site.slug}`; canonical, sitemap, RSS and Open Graph from `publicOrigin`; dashboard "View public site" links, widget `siteUrl`, voter sign-in / subscribe-confirm redirects, and end-user email links (posts, follow, unsubscribe) on the custom domain.
5. **Deploy + tests + docs:** `deploy/Caddyfile` `on_demand_tls { ask http://localhost:3000/api/domain-check }` + catch-all `https://` block; setup notes (DNS record for `CUSTOM_DOMAIN_TARGET`). e2e with `acme-<id>.localhost:3000`: add → verify → public pages + links on the custom host, app-domain 308, dashboard 404 on the custom host, remove → back. "As built", PROGRESS.

## 9. Done when (6A)
- [x] An owner can upgrade, change interval, downgrade and cancel through Stripe; the app follows within one webhook. *(Code + unit tests with a mocked Stripe; not yet tried against Stripe test mode, waiting for keys.)*
- [x] Limits and gates hold on the server for every create path (tests), with an upgrade prompt in the UI.
- [x] No Stripe keys ⇒ everything unlimited, no billing UI.
- [x] An owner can delete the account.
- [x] Checks green (unit, e2e, lint, typecheck, build).

## 10. As built: 6A (2026-11-01)

- **Plans (`src/lib/plans.ts`):** plan ids, prices (yearly = 20% off, shown per month), limits (teammates, workspaces, roadmaps, feedback boards), features, `planFor(feature)`, `limitText`. Stripe prices are found by lookup key `<plan>_<interval>ly` (`pro_monthly`, `startup_yearly`…). `pnpm stripe:setup` (`scripts/stripe-setup.ts`) creates the products and prices in the Stripe account from this file; safe to run again.
- **Schema (`0011_billing`):** `account_billing` (one row per paying account; no row = Free), `stripe_events` (applied event ids), enum `plan_id`.
- **Billing on/off:** `billing.enabled()` (`src/server/services/plan-limits.ts`) = `STRIPE_SECRET_KEY` is set. Off ⇒ every account is treated as Enterprise and Settings → Billing is hidden. So dev, CI and e2e run unlimited. (The planned `NEXT_PUBLIC_STRIPE_ENABLED` wasn't needed: the nav item is decided on the server.)
- **Effective plan:** `active` / `trialing` / `past_due` keep the stored plan (Stripe retries past_due); anything else ⇒ Free.
- **Limits:** `assertWithinLimit` on workspace, roadmap and feedback-board creation; teammates (members + pending invites) in invitations and Better Auth's `membershipLimit`. Errors are `PlanLimitError` (a `ForbiddenError`); `action()` returns `{ ok: false, error, upgrade: true }` and `useActionError()` shows a toast with an **Upgrade** button to Settings → Billing. Toasts are clickable over open modals now (`pointer-events-auto`).
- **Gates (P6/P7):** saved switches stay saved; the public site applies the plan. Comments and follows: `gateSettings()` in the public workspace loader (also covers the public API routes, which use the same loader) and `assertSwitchesAllowed()` when saving Public settings (locked switches show a "Startup plan" badge; a switch that is still on can be turned off). Reactions (hidden + API 404), embeds (embed mode shows "Embedding needs a paid plan" with a link to the full page) and the workspace logo in the public header (initials instead) come from `features` on the public workspace. Uploading a logo isn't blocked; only its public display. The plan is read inside the cached loaders, so the webhook calls `invalidateSite(accountId)`.
- **Stripe:** `src/server/stripe.ts` (lazy client). `startCheckout` (owner only; creates the customer once with an idempotency key; accounts already paying are sent to the portal instead, so never two subscriptions; promo codes allowed), `openPortal`, `toSnapshot` (period end from the first subscription item: Stripe's 2025+ API moved it there).
- **Webhook `POST /api/webhooks/stripe`:** verifies the signature on the raw body, then `handleStripeEvent`: for `checkout.session.completed` and `customer.subscription.*` it **re-fetches the subscription from Stripe** (so out-of-order events can't roll it back), and records the event id in the same transaction as the update (a failure rolls both back and Stripe retries). The account is found from the subscription's `metadata.accountId`, else by customer id. Unknown price lookup keys are logged and ignored. `invoice.payment_failed` and `customer.subscription.deleted` email the owners (`billing-payment-failed`, `billing-canceled`; job id = event + recipient).
- **UI:** Settings → **Billing** (owners and admins see it; only owners get the buttons): current plan, renew/end date, past-due warning, usage bars, plan cards with a Monthly/Yearly switch, **Manage billing** (portal). A past-due banner sits above every dashboard page for owners and admins.
- **Account deletion:** Settings → Account → **Delete account** (owner; type the account name). Cancels the Stripe subscription at once (no proration), deletes the organization (everything cascades), drops the public site cache, then a `delete-account-files` job removes `accounts/<id>/` from storage (`src/server/storage/purge.ts`, kept free of `server-only` because the worker imports it).
- **Tests:** `src/server/services/billing.test.ts` (13: billing off, Free limits, gates, Stripe statuses, lookup by customer, unknown prices, once-per-event webhooks, overview + roles, notices, deletion, file purge). e2e `e2e/billing.spec.ts`: delete account (always runs); Free limits + upgrade toast + locked switches (runs only with `E2E_BILLING=1` against a dev server started with any `STRIPE_SECRET_KEY`). 220 unit, 28 e2e (+1 skipped).
- **Not done yet (needs the owner's Stripe test account):** a real Checkout → webhook → Pro run. Setup: put the test keys in `.env.local`, `pnpm stripe:setup`, `stripe listen --forward-to localhost:3000/api/webhooks/stripe` (gives `STRIPE_WEBHOOK_SECRET`), and in the Stripe dashboard turn on the customer portal with plan switching between the six prices.

## 11. Short public URLs for the default workspace (approved + built 2026-11-01)

**Question (owner):** LoopedIn's public site is `app.loopedin.io/<account>#/roadmap` (`#/updates`, `#/ideas-board`, `#/kb`). Ours was `/<account>/<workspace>/roadmap`. Which is better?

**Decision:** keep real paths, not `#/` hashes. A hash never reaches the server, so every tab would be one page to Google, link previews would all look the same, and there could be no real 404/308, sitemap entries, canonical URLs or server rendering per page. Take LoopedIn's good part instead: **no workspace segment for the account's default workspace.** `/ideas` and `/articles` stay (not `/ideas-board`, `/kb`).

| URL | Result |
|-----|--------|
| `/<account>/roadmap`, `/updates`, `/ideas`, `/articles` (+ cards, posts, ideas, articles, `feed.xml`) | Default workspace |
| `/<account>/<default-workspace>/…` | 308 to the short URL (query kept), so old links still work |
| `/<account>/<other-workspace>/…` | Unchanged for every other workspace |
| `/<account>` | 308 to the default workspace's home tab when it is the only public workspace; otherwise the workspace list |

- **Default workspace** = the account's oldest workspace (`created_at`, then `id`). If it's deleted, the next oldest takes the short URLs.
- Workspace slugs can't be `roadmap`, `updates`, `ideas` or `articles` (`workspaceSlugSchema`).
- **Built:** `src/lib/public-path.ts` (`SITE_MODULES`, `wsSegment`, `wsPath`, `shortenPath`). `resolveSite` returns `defaultWorkspace`; the public workspace loader returns `isDefault`. `src/proxy.ts` rewrites `/<account>/<module>/…` to the default workspace, 308s its long URLs, and shortens the redirects that `publicPathStatus` returns. Every public link, canonical URL, sitemap entry, RSS link, email link (post emails, follow emails, subscribe confirmation) and dashboard link (View public roadmap, post/article public links, embed URLs) uses the short form. `embed.js` still builds the long URL; the iframe follows the 308. The SQL helper lives in `services/default-workspace.ts` because the worker imports it. `src/lib/paths.ts` (`publicPath`) was removed since nothing used it any more.
- **Custom domains (6D)** will reuse this: `feedback.acme.com/roadmap`.
- **Tests:** `src/lib/public-path.test.ts`; `public-site.test.ts` (default = oldest, per account; reserved slugs). 225 unit, 28 e2e.

## 12. As built: 6B Widget (2026-11-01)

- **Install:** `<script>window.radiusRoadmapConfig = { site: "<account>" };</script><script src="<app>/widget.js" async></script>`. Optional: `workspace` (any workspace other than the default), `selector` (open from the customer's own element), `token` (signed identity), `user: { name, email }` (prefills the feedback form, unverified), `autoInit: false` + `RadiusRoadmap.init()`. JS API: `RadiusRoadmap.show() / hide() / toggle()`; calls made before it loads run once it's ready. (The doc 26 §4 draft used `rrWidget` / `type`; the global is `radiusRoadmapConfig`, and layout lives in the settings page.)
- **Schema (`0012_widget`):** `widget_keys` (one signing key per account), `widget` value in `feedback_source` and `vote_source`, `widget_view` event. Widget settings in the workspace `settings.widget` (layout sidebar/popover, position, launcher bell/none, colour, title, reactions, feedback).
- **Settings → Widget** (sidebar link, owners/admins): install snippet (copy), "Try it on a test page" (`/widget-test.html?site=…`), look and content form, **Identify your users** (signing key fetched on demand, rotate with confirmation, Node example). Shows a plan notice when the plan has no widget (Startup+).
- **API `/api/widget/*`** (`src/server/widget-request.ts`): CORS `*`, no cookies; the visitor id is kept in the host site's `localStorage` and sent as `x-rr-visitor`; identity token as `x-rr-token`. `GET config` (settings, 10 latest posts, own reactions, emoji list, site URL, user), `GET posts/<slug>` (body HTML), `POST reactions`, `POST feedback`, `POST view`. Data cached with the public site's tags (`src/server/widget-cache.ts`), so post, setting, reaction and plan changes show at once.
- **Identity (P10):** HS256 JWT signed with the account key; needs `sub` and `exp`, at most 24 h; `email` and `name` optional. A valid token makes a verified `tracked_user` (`kind: sso`, `external_id = sub`); otherwise the form's name + email make an unverified `widget` user.
- **Feedback:** goes to the workspace's first public ideas board. Unverified people always land in the **triage inbox** (no Turnstile inside the widget, so review is the spam guard; plus the idea submit rate limits); verified ones follow the board's auto-publish setting. Team gets the usual "new idea" alert.
- **Bundle (`widget/`):** Preact in Shadow DOM, 9.9 KB gzipped; `pnpm build:widget` fails above 15 KB (`scripts/check-widget-size.mjs`). Launcher bell with unread badge (newest post date seen, in `localStorage`), sidebar or popover, post list → post view (server-sanitized HTML, cover, reactions, open on site), "Send feedback" form, Escape closes, "Powered by" link. Colour from settings (default indigo).
- **Home:** "Widget opens" tile (`widget_view`, rate-limited per visitor).
- **Tests:** `src/server/services/widget.test.ts` (settings, keys + rotation, tokens: other account's key, expired, too long, missing `sub`; identity; site data; plan gate; inbox review). e2e `e2e/widget.spec.ts` (publish → test page → badge → post → reaction → badge cleared → feedback → inbox). 232 unit, 29 e2e (+1 skipped).
- **Not done:** user segmentation (`segment`, Enterprise), ideas list / article search in the widget (P9: later), dark mode for the widget.

## 13. As built: 6C Branding (2026-11-01)

- **Schema (`0013_account_branding`):** `account_settings` (account_id PK → organization, cascade; `branding` jsonb `{ favicon, color, font, hidePoweredBy }`). The account logo stays `organization.logo`. Workspace settings: `theme: system | light | dark` replaces `darkModeDefault` (read as a fallback: old `true` → dark, else system; saving the workspace form drops the old key).
- **Service** `src/server/services/branding.ts`: `getBranding`, `updateBranding` (owners/admins; a gated value can be set or changed only on a plan that has it; clearing and re-saving unchanged values after a downgrade are allowed), `setFavicon`, `effectiveBranding(plan, stored)` / `getEffectiveBranding` (B7: what the plan lacks falls back; hex re-checked because it goes into a `<style>` tag), `getEmailBrand` (worker-safe). Gates: favicon + colour = `whiteLabel`, font = `customFonts`, hide "Powered by" = `hidePoweredBy` (Pro); logo = `logo` (Startup).
- **Libs:** `src/lib/color.ts` (WCAG luminance, contrast, `foregroundFor`), `src/lib/fonts.ts` (15 Google Fonts, `fontHref`, `fontStack`), `src/lib/schemas/branding.ts`.
- **Settings → Branding** (new nav item, owners/admins): logo (moved here from Account), favicon (256 KB, `prefixes.accountFavicon`, also capped in the signed upload and the local upload route), brand colour with a low-contrast warning (< 3:1 on white), font picker rendered in each font, "Hide Powered by" switch, plan badges linking to Billing, live preview. Settings → Workspace: Theme select (Visitor's system / Light / Dark).
- **Public sites + embeds:** `loadSite` returns the effective brand (site cache tag, which plan changes already drop). `SiteShell` sets `data-site-theme`, renders `SiteBrand` (`--brand`, `--brand-foreground`, `--site-font` on `:root` + the font stylesheet), header logo = workspace logo → account logo → initials, footer hidden when "Powered by" is off. `globals.css`: public `--primary`/`--ring` read `var(--brand, …)` in light and dark; the light set is complete so "Light" holds even when `<html>` is dark; the `dark:` variant also follows a fixed site theme (portalled dialogs included). New `sites/[account]/layout.tsx` sets the favicon (favicon → logo → app icon); the app icon moved from `src/app/favicon.ico` to `public/favicon.ico` + root `metadata.icons` so a nested `icons` replaces it cleanly.
- **Widget:** config gets `settings.color` (widget colour, else brand colour), `settings.onColor`, `brand { font { href, stack }, poweredBy }`. The bundle uses `--rr-on-accent` for text on the accent, loads the font into the host page's `<head>` (font faces don't load from a shadow root), hides "Powered by". 10.1 KB gz.
- **Emails (B4):** `EmailBrand` (`name`, absolute `logoUrl`, `color`, `poweredBy`) on `voter-code`, `subscribe-confirm`, `update-published`, `idea-status-changed`, `idea-shipped`: logo above the heading, brand-coloured button with readable text, footer "<Account> · Powered by Radius Roadmap" or just the name. Team emails unchanged.
- **Changes from the plan:** favicons are PNG/JPEG/WebP only (SVG can carry scripts on our origin; ICO isn't in the upload pipeline). "Default" font = the app's font (Geist), not Inter, so existing sites don't change.
- **Tests:** `branding.test.ts` (colour maths, font URL, roles, tenant isolation, favicon kept on save, validation, gates per field, downgrade fallback, Free, email brand vs team email), `widget.test.ts` (brand fallback, widget colour wins), `keys.test.ts` (favicon cap), e2e `e2e/branding.spec.ts` (colour, font, favicon, dark theme, Powered by → public page computed style + widget config). 243 unit, 30 e2e (+1 skipped).
- **Not done:** custom SMTP per account (later, §7); fonts in emails (web-safe stack on purpose).

## 14. As built: 6D Custom domain (2026-11-01)

- **Decisions:** D1 = the customer's own domain (`feedback.acme.com`, CNAME), never subdomains of our app domain; D2–D9 as recommended.
- **Schema (`0014_custom_domains`):** `custom_domains` (one per account; hostname not unique overall, only among `active` rows via a partial unique index, so a pending claim can't block the real owner); `domain_status` enum.
- **Env:** `CUSTOM_DOMAIN_TARGET` (optional). Unset in production = feature off (Settings → Domain says so). In development the target defaults to `localhost` and `*.localhost` hosts verify without DNS.
- **Service** `src/server/services/custom-domains.ts` (worker-safe): `setDomain` (owners/admins, Pro gate, never our domain or its subdomains, new token, replaces the old one), `removeDomain`, `dnsRecords`, `checkDns` (TXT `_radius-roadmap.<host>` = `radius-roadmap-verify=<token>`, then CNAME → target; resolver injected for tests, 5 s timeout), `verifyDomain` (pending → active; pending > 48 h → failed; active fails after 3 bad checks; "already used" if another account is live on it), `domainsDue`, `siteForHost` / `activeHostname(s)` (plan-gated, D6), `inactiveDomainSite`, `hostOrigin`, `publicSiteBase`, `domainNotice`.
- **Settings → Domain** (new nav item): add (accepts pasted URLs), status badge (Waiting for DNS / Live / Not working + reason), both DNS records with copy buttons, Check now, Remove (type the hostname). Worker scheduler `verify-domains` every 10 min; owners get `domain-active` / `domain-failed` emails; the web app's site cache is dropped via `/api/internal/revalidate` (workspace id now optional).
- **Routing (`src/proxy.ts`):** matcher now includes `/api` (app host passes it straight through). Custom host → `siteForHost` → whole path is the site (`/roadmap`, `/<workspace>/roadmap`, `/` = site root, `/sitemap.xml`, its own `/robots.txt`); only `/api/public/*`, `/api/files/*` and `/api/domain-check` pass; dashboard/auth pages, other APIs and server actions (`next-action` header) → 404. Inactive (downgraded / failed) domain → 308 to the app-domain URL. App-domain public pages → 308 to the live custom domain, except `?embed=1`. Domain redirects carry `Cache-Control: max-age=3600` (browsers keep 308s forever otherwise, which would break removal). Redirects are built from an explicit origin (`request.nextUrl` has the server's host). Host lookups cached 60 s per process in production, not cached in development.
- **Links:** the proxy sets `x-rr-site-prefix` (always overwritten); pages use `loadSiteForRequest()` → `site.prefix` ("" on the custom host, `/<account>` otherwise; only those two values) and `site.publicBase` (cached with the site tag) for canonical URLs, Open Graph, sitemap and RSS. API redirects use `sitePathPrefix(request, slug)`. Dashboard "View public …" links and the widget's site link take `activeHostname`; embed URLs stay on the app domain. Worker emails (posts, follow emails) use `publicSiteBase`.
- **`GET /api/domain-check?domain=`:** 200/404, 30 asks per domain per minute (all asks come from Caddy's one address).
- **Deploy:** `deploy/Caddyfile` has `on_demand_tls { ask http://localhost:3000/api/domain-check }` and a catch-all `https://` block with `tls { on_demand }`. Production setup: an A record for the `CUSTOM_DOMAIN_TARGET` hostname pointing at the server, then set the env var.
- **Not done / limits:** root domains (`acme.com`, needs an A record; later); a removed domain's row is gone, so its host 404s instead of redirecting (only switched-off domains redirect); voter sign-in doesn't carry over between the app domain and the custom domain (D8).
- **Tests:** `custom-domains.test.ts` (hostname rules, not our domain, dev hosts, roles, Pro gate, replace, per-account, TXT required, the second claimant can't activate, wrong CNAME, 48 h expiry, 3 failures, scheduling, host mapping, links, downgrade, owner notice). e2e `e2e/domain.spec.ts` (add → verify → dashboard link → app-domain 308 → links/canonical on the domain → app routes 404 there → embed stays → remove). 256 unit, 31 e2e (+1 skipped).
