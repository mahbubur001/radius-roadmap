# 28 — Phase 8 plan: Platform admin (operator panel)

Status: **APPROVED 2026-11-01** (C1–C10 as recommended; C1 = option A, the `PLATFORM_ADMIN_EMAILS` list; a `user` role column can come later). **Built 2026-11-01** (see §7). **Phase 8 done.**

Today every customer signs up alone and only Stripe changes a plan. There is nowhere for **us, the operator**, to see all accounts, invite a customer, grant or extend a plan, or stop an abusive account. This phase adds that, before the WordPress plugin, because it's needed to run the business (sales, partners, trials, support).

What exists today:
- Customers: `/sign-up` → onboarding creates the account (Better Auth organization) and first workspace.
- Team invites inside an account (Settings → Team): `invitation` rows, `/accept-invite/<id>` handles sign-up / sign-in and joins the account with the role (owner, admin, member).
- Plans: `account_billing` mirrored from Stripe; `getAccountPlan()` (`services/plan-limits.ts`) is the one place every limit and gate asks. Billing off (no Stripe keys) = everything unlimited.
- `admin` is already a reserved account slug, so `/admin` is free for this.

---

## 1. Decisions (my recommendation first)

| # | Question | Recommendation | Alternative |
|---|----------|----------------|-------------|
| C1 | Who is a platform admin | **Email list in an env var `PLATFORM_ADMIN_EMAILS`** (comma-separated). The person must be signed in with that email, verified. Changing who's an admin = a deploy, which is fine for a small team and can't be granted by a bug in the app | Better Auth `admin` plugin (role on the user table, ban, impersonate; same package, but more HTTP endpoints to lock down) |
| C2 | Where | **`/admin`**, its own layout (not inside a customer's dashboard). Anyone else gets a plain 404, so the panel's existence isn't revealed. Never framed, `noindex` | A separate app / subdomain |
| C3 | Inviting a customer | Admin enters **company name, account URL, owner email, plan (optional end date), note**. We create the account and its first workspace (with the usual seed data), then an **owner invitation** for that email and send a "Your Radius Roadmap account is ready" email. The person accepts through the existing `/accept-invite` page (signs up or signs in) and lands in the account. Resend / cancel while pending | Create the user too and email a password; or a sign-up link that runs onboarding |
| C4 | Setting a plan by hand | **Plan override** per account: plan + optional **end date** + note. While active it **wins over Stripe** (and Free); when it ends, the account falls back to its Stripe plan or Free. Nothing is deleted on fallback (doc 26 P6 rules apply). Works with billing off too (then it's informational, everything is unlimited anyway) | Edit `account_billing` directly (Stripe would overwrite it) |
| C5 | Override ending | The account's owners get an email **7 days and 1 day before** it ends, and when it ended (with a link to Billing). Daily job, idempotent | No emails |
| C6 | If a customer with an override also pays | Allowed; the override still wins while active. The account page shows both, with a warning, so we can end the override or refund. We never touch the Stripe subscription from the admin panel | Block checkout while an override is active |
| C7 | Accounts list and detail | **List:** search by name, URL or member email; filter by plan and status; columns plan (+ source: Stripe / manual / free), owner, workspaces, members, created, last activity. **Detail:** owners and members, workspaces (with public links), usage vs limits, Stripe ids (links to the Stripe dashboard), custom domain, API keys / webhooks count, override form, pending owner invitation, audit history | List only |
| C8 | Suspending an account | **Suspend / unsuspend** with a reason (abuse, non-payment, request). Suspended: team members see an "Account suspended, contact support" page instead of the dashboard; public site, widget, embeds and custom domain show "This site is unavailable"; API keys get 403; webhooks and emails to subscribers pause. Data is kept. Deleting stays the owner's choice (Settings → Account) | Delete accounts from the panel |
| C9 | Audit log | Every admin action (invite, override set/changed/ended, suspend, unsuspend) is written to an **append-only `admin_audit_log`** (admin, action, account, details, time) and shown on the account page and an "Activity" page | No log |
| C10 | "Log in as customer" (impersonation) | **Not in this phase.** It's the riskiest feature; add later with a visible banner, read-only by default, and the audit log | Build it now |

Also on `/admin` home: counts (accounts, by plan, new this week, suspended, overrides ending within 7 days).

---

## 2. Data (migration `0016`)

- `plan_overrides`: account_id PK → organization (cascade), plan (`plan_id` enum), ends_at (nullable = no end), note, set_by (admin email), created_at, updated_at, `warned_7d_at`, `warned_1d_at`, `ended_notified_at`.
- `admin_audit_log`: id, admin_email, action, account_id (nullable, set null on delete), details jsonb, created_at. Insert only.
- `account_settings` (exists, doc 26 6C): add `suspended_at`, `suspended_reason`.
- Owner invitations reuse the `invitation` table (role `owner`); `inviter_id` = the admin's user id.

## 3. Code

- `src/lib/env.ts`: `PLATFORM_ADMIN_EMAILS` (optional; unset = no platform admins).
- `src/server/platform-admin.ts`: `requirePlatformAdmin()` (session + verified email in the list, else `notFound()`), `isPlatformAdmin(email)`.
- `src/server/services/platform/*`: `accounts.ts` (list, detail, stats), `overrides.ts` (set, end, active override), `customers.ts` (invite customer, resend, cancel), `suspension.ts`, `audit.ts`. They take an `AdminContext` (admin email + user id), never a tenant context, and every write appends to the audit log.
- `getAccountPlan()`: active override first, then Stripe status, then Free. One query (join). `getBillingOverview` shows "Pro, granted until 1 Mar" on the customer's Billing page.
- Suspension checks: `requireWorkspace` / `requireAccount` (dashboard), `resolveSite` (public pages, widget, embeds, custom domains via the proxy), `verifyApiKey`, webhook `createDeliveries`, subscriber post emails.
- `src/app/admin/…`: `page.tsx` (home stats), `accounts/page.tsx` (list), `accounts/[id]/page.tsx` (detail + actions), `accounts/new/page.tsx` (invite a customer), `activity/page.tsx` (audit log). Actions in `src/app/admin/_actions.ts`, each starting with `requirePlatformAdmin()`.
- Emails: `customer-invite`, `plan-override-ending` (7 days / 1 day), `plan-override-ended`, `account-suspended` (to owners, optional).
- Worker: daily `plan-overrides` scheduler job (warnings + end notices).
- `src/proxy.ts`: `/admin` already goes to the app (reserved); add `noindex` + no framing.

## 4. Steps (each: tests, lint, typecheck, commit)

1. **Access + data:** env var, `requirePlatformAdmin`, `/admin` layout and home stats, migration `0016`, audit log helper. Tests: non-admins (signed out, unverified, other emails) get 404; admins in.
2. **Accounts:** list (search, filters, pagination) and detail page (members, workspaces, usage, billing, domain, API/webhooks, audit history). Tests: search by member email, counts, plan source.
3. **Plan overrides:** service + `getAccountPlan` change + form (plan, end date, note; end now) + customer Billing page label + daily warning/ended emails. Tests: override beats Stripe and Free, expiry falls back to Stripe / Free, limits and gates follow, emails sent once, audit entries.
4. **Invite a customer:** form → account + workspace + owner invitation + email, resend / cancel, optional override at the same time; accepting makes them owner. Tests: account URL taken, email already owns an account (allowed: people can have several), invitation accepted → owner, audit.
5. **Suspend + e2e + docs:** suspend/unsuspend with all effects (dashboard page, public 503 page, widget/API/webhooks/emails paused), audit Activity page. Playwright: admin invites a customer with Pro until a date → customer accepts and sees Pro on Billing → admin suspends → public site unavailable, dashboard shows the notice → unsuspend. "As built", PROGRESS, CLAUDE.md.

## 5. Not in Phase 8

- Impersonation (C10), staff roles inside the admin panel (everyone in the list is a full admin), refunds or Stripe changes from the panel, coupons, exporting all data, deleting accounts from the panel, GDPR export tooling.

## 6. Done when

- [x] Only people in `PLATFORM_ADMIN_EMAILS` can open `/admin`; everyone else gets 404.
- [x] An admin finds any account and sees its plan, owner, usage and history.
- [x] An admin invites a new customer with a plan; the customer accepts and starts on that plan.
- [x] An admin grants or extends a plan with an end date; it ends on time with warnings, and falls back correctly.
- [x] An admin suspends and restores an account, and every action is in the audit log.
- [x] Checks green (unit, e2e, lint, typecheck, build).

## 7. As built (2026-11-01)

- **Access:** `PLATFORM_ADMIN_EMAILS` (env, comma-separated, case-insensitive, verified emails only; `src/server/platform-admins.ts`, worker/proxy-safe). `src/proxy.ts` checks the Better Auth session for every `/admin…` request and returns the plain 404 page to everyone else, so non-admins get a real 404 with a neutral title (a streamed page can't set its status, and its `<title>` would have leaked "Admin"). Pages and actions check again with `requirePlatformAdmin()` (`src/server/platform-admin.ts`).
- **Schema (`0016_platform_admin`):** `plan_overrides` (plan, ends_at, note, set_by, reminder marks), `admin_audit_log` (append-only), `account_settings.suspended_at / suspended_reason`.
- **Plan overrides:** `getAccountPlan()` = active override (no end, or end in the future) → Stripe paid status → Free, in one query. An end date runs to 23:59:59 UTC of that day. Customer's Billing page says "Granted by Radius Roadmap until …". The account page warns when Stripe is also paid (C6). Daily `plan-overrides` job (09:00 UTC) emails owners 7 days / 1 day before and once ended (`plan-override-ending`, `plan-override-ended`); marks reset when an admin changes the override.
- **Invite a customer:** `/admin/accounts/new` (company name → account URL and product → workspace URL filled automatically until edited; owner email; optional plan, end date, note) → organization + seeded workspace + optional override + owner `invitation` (14 days, inviter = the admin) + `customer-invite` email → accepted through the existing `/accept-invite` page. Nothing half-made is left if a step fails. Resend extends it; cancelling while nobody has joined deletes the account made for it.
- **Accounts:** `/admin` (counts: accounts, new this week, suspended, granted plans ending in 7 days, by plan), `/admin/accounts` (search by name, URL, member or invited email; plan and status filters; pages of 50), `/admin/accounts/<id>` (plan + source, Stripe link, override form with `DatePicker`, usage vs limits, API keys / webhooks / domain, people and the pending owner invitation, workspaces with public links, suspend/restore, history), `/admin/activity` (last 200 actions).
- **Suspension:** dashboard → `/suspended` page (`requireAccount`, so server actions stop too); `resolveSite` hides the account from public pages, public API, widget and embeds, and the proxy shows a 503 "This site is unavailable" page (not a 404); custom domains fall back to it; API keys stop (401); webhook deliveries and subscriber / follower emails pause (checked before a post is claimed, so it isn't marked as sent). `suspended` is a reserved account slug.
- **Bug found by the tests:** the per-plan count used parameters inside a GROUP BY expression, which Postgres rejects (the SELECT and GROUP BY copies count as different expressions); the fixed status list is now inlined.
- **Tests:** `platform-admins.test.ts` (who's an admin), `services/platform/platform.test.ts` (override beats Free and Stripe, falls back on expiry and when ended, end of day UTC, reminders once each, invite creates account + seeded workspace + plan + owner invitation, duplicate URL, resend, cancel deletes the empty account, suspension hides the site / stops keys / is reversible, audit entries). e2e `e2e/admin.spec.ts` (404 for signed-out and ordinary users → admin invites a customer on Pro → customer signs up through the invitation and lands as owner → suspend: dashboard → /suspended, public site 503 → restore → history lists every action → search by owner email). 287 unit, 33 e2e (+1 skipped).
- **Not done (§5):** impersonation, staff roles inside the panel, Stripe changes from the panel, deleting accounts from the panel (except the empty one a cancelled invitation leaves).

