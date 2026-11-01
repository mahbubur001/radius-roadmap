# 29 — Two plans: Free and Pro

Status: **APPROVED 2026-11-01** with the owner's changes: T3 logos free (as recommended), **T4 hiding "Powered by" is Pro**, **T11 files on Cloudflare R2**. **Built 2026-11-01** (see §5).

**Owner's idea (2026-11-01):** only two plans. Anyone can sign up and use **every feature on Free**. **Pro** adds **custom domain**, **file uploads / attachments**, and (owner, T4) **removing "Powered by"**. Files are stored on **Cloudflare R2** (T11). This replaces the four plans of doc 11 / doc 26 P2 and the feature gates of doc 26 P7.

What exists today (`src/lib/plans.ts`, doc 26 6A):
- Four plans: Free / Startup $12 / Pro $24 / Enterprise $40 a month (yearly −20%), with limits (teammates, workspaces, roadmaps, boards) and 16 feature gates (logo, widget, embed, comments, follows, reactions, white-label, fonts, custom domain, hide "Powered by", social sign-in, password protection, webhooks, API, SSO, segmentation).
- Everything asks `getAccountPlan()` (platform override → Stripe → Free) and `planIncludes()` / `assertFeature()` / `assertWithinLimit()`. Billing is off without Stripe keys (everything unlimited).
- Stripe prices found by lookup key (`pro_monthly`, `pro_yearly`, …), created by `pnpm stripe:setup`.

Files people can upload today:

| Kind | Where | Today |
|------|-------|-------|
| **Branding images** | avatar, account logo, favicon, workspace logo | logo = Startup, favicon = Pro |
| **Images in content** | images inside card / idea / post / article descriptions, card header image, post cover image | everyone |
| **Card attachments** | files on roadmap cards (images + PDF, up to 10 MB) | everyone |

---

## 1. Decisions (my recommendation first)

| # | Question | Recommendation | Alternative |
|---|----------|----------------|-------------|
| T1 | Pro price | **Keep today's Pro: $24 / month, $19.20 / month billed yearly** (Stripe lookup keys `pro_monthly`, `pro_yearly` stay, nothing to recreate) | A new price |
| T2 | Limits on Free | **None**: unlimited workspaces, roadmaps, boards and teammates on both plans. Abuse is handled by the existing rate limits and the platform admin's suspend (doc 28) | Generous caps on Free (e.g. 3 workspaces, 10 teammates) |
| T3 | What "file uploads" means for Pro | **Decided: images in content + card attachments are Pro.** Free keeps **branding images** (avatar, account and workspace logos, favicon) | — |
| T4 | Everything else | **Decided: hiding "Powered by" is Pro** (Free sites, embeds, widget and emails show it). Everything else is Free: widget, embeds, comments, follows, reactions, branding (colour, font, logo, favicon), API keys, webhooks | — |
| T5 | Storage for Pro | **No total quota at launch**; per-file limits stay (2 MB images, 10 MB attachments). The platform admin's account page shows each account's storage used, so we can add a quota later if needed | A quota now (e.g. 10 GB per account) |
| T6 | After a downgrade (doc 26 P6) | **Nothing is deleted or hidden**: existing images and attachments keep showing; adding new ones asks to upgrade. The custom domain switches off (falls back to the app address, as today) | Hide existing files |
| T7 | Old plan names | The database keeps the `startup` / `enterprise` values (an enum can't drop values safely); code reads **`startup` as Free and `enterprise` as Pro**. No live subscriptions exist yet (billing not launched) | Migrate old rows |
| T8 | Where Free users meet the Pro wall | The image button in every editor, card header image, post cover and the card Attachments tab show a small **"Pro" badge**; clicking opens the existing upgrade toast → Settings → Billing. Settings → Domain keeps its Pro badge. Server checks on every upload path | Hide the buttons on Free |
| T9 | Billing page | **Two cards** (Free, Pro) with the plain list "Free: everything. Pro: + custom domain, + image and file uploads"; monthly / yearly toggle for Pro | — |
| T10 | Platform admin (doc 28) | Plan overrides and "invite a customer" offer **Free / Pro** only | — |
| T11 | File storage | **Decided: Cloudflare R2** (replaces S3 in doc 14; no egress fees). New `STORAGE_DRIVER=r2` with `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` (the bucket's public domain, e.g. `files.<app-domain>` or `*.r2.dev`). Same AWS SDK (R2 speaks the S3 API, region `auto`), **no new dependency**. Because **R2 has no presigned POST**, uploads move to **presigned PUT** URLs that sign the Content-Type and the exact Content-Length (a different or bigger file is rejected by R2); the server still checks size and magic bytes before saving the key. The local dev driver switches to the same PUT shape. The bucket needs a CORS rule allowing PUT from the app origin | Keep S3 |

## 2. Code changes

- `src/lib/plans.ts`: `PLAN_IDS` shown = `free | pro`; `normalizePlan()` maps `startup → free`, `enterprise → pro`; features become `customDomain`, `uploads`, `hidePoweredBy`; limits Infinity on both. `getAccountPlan()` returns the normalized plan.
- Feature gates: remove the now-free checks (logo, widget, embed, comments, follows, reactions, white-label colour, fonts, favicon, API, webhooks). Keep `customDomain` and `hidePoweredBy`; add **`uploads`**.
- Storage (`src/server/storage`): `r2` driver (S3 client with the R2 endpoint, region `auto`, keys from env), `createUpload` returns `{ method: "PUT", url, headers, key }` for every driver (presigned PUT for r2/s3; a signed local URL in dev); `ImageUpload`, the editors' image upload and card attachments send the file with `fetch(url, { method: "PUT", headers, body: file })`; the local upload route accepts PUT. `fileUrl` uses `R2_PUBLIC_URL`. Card attachments keep `Content-Disposition: attachment` (signed into the PUT).
- `uploads` gate on the server: `requestUploadAction` / `saveUploadAction` for `card-image` (all content images, header images, covers) and the card attachment upload; branding purposes stay open. UI badges (T8).
- Billing page, plan picker, `scripts/stripe-setup` (only `pro_monthly` / `pro_yearly`), upgrade messages ("… needs the Pro plan"), platform admin plan selects.
- Platform admin account page: **storage used** (sum of the account's files) for T5.
- Docs: doc 11 and doc 26 P2/P7 marked as replaced by this doc.

## 3. Steps (each: tests, lint, typecheck, commit)

1. **Plans + gates:** `plans.ts`, `normalizePlan`, remove free gates, add `uploads`; update the unit tests that relied on Startup/Enterprise gates (branding, widget, API, webhooks, comments…). Tests: Free can do everything except custom domain and uploads; old `startup`/`enterprise` rows behave as Free/Pro.
2. **Upload wall:** server checks on all content-image and attachment paths; Pro badges + upgrade toast in the editors, header/cover pickers and Attachments tab; existing files stay. Tests: Free upload refused (`PlanLimitError` → upgrade toast), branding uploads allowed, downgrade keeps old files.
3. **R2 storage:** `r2` driver, presigned PUT uploads for every driver, local driver on PUT, env + `.env.example` + doc 14, R2 setup notes (bucket, public domain, CORS, API token). Tests: presigned PUT signs content-type and content-length, size/magic-byte checks still reject bad files, keys stay under the tenant prefix.
4. **Billing + Stripe + admin:** two-card Billing page, `stripe:setup` creates only Pro prices, admin selects Free/Pro, storage used on the admin account page.
5. **e2e + docs:** with billing on in a unit/integration test (Stripe mocked): Free account uploads → upgrade prompt; Pro override → upload works; domain gate. "As built", PROGRESS, CLAUDE.md.

## 4. Done when

- [x] A new account can use every feature without paying, except custom domain and file uploads.
- [x] Pro unlocks both; downgrading keeps existing files and switches the domain off.
- [x] Billing shows two plans; Stripe needs only the two Pro prices.
- [x] Uploads work with `STORAGE_DRIVER=r2` (owner's bucket) and locally; a mismatched type or size is refused.
- [x] Checks green.

## 5. As built (2026-11-01)

- **Plans** (`src/lib/plans.ts`): `free | pro`; `normalizePlan()` reads old `startup` as Free and `enterprise` as Pro everywhere a stored plan is read (`getAccountPlan`, billing notices, admin lists and SQL, override reminders). Limits are Infinity on both. Pro-only gates: `customDomain`, **`uploads`**, `hidePoweredBy` (owner's T4). The other gate names stay in place and are on every plan, so a feature can move back to Pro without touching its code. Billing off (no Stripe keys) = Pro. Stripe: only `pro_monthly` / `pro_yearly`.
- **Upload wall:** `assertFeature(…, "uploads")` on content images (`card-image` purpose: images in descriptions, posts, articles, card headers, post covers) and on card attachments (request + `addAttachment`). Logos, favicon and avatars stay free. UI: `PlanFeaturesProvider` in the workspace layout, `ProBadge` + `useProWall()` (upgrade toast) on the editor image button, the header/cover image field and the Attachments tab. Existing files keep showing after a downgrade.
- **Storage = Cloudflare R2 only** (owner: no local, no S3 code). `src/server/storage/r2.ts` (S3 client on `https://<account>.r2.cloudflarestorage.com`, region `auto`), `createUpload` → presigned PUT with content type and exact length signed (`@aws-sdk/s3-request-presigner`, replacing `@aws-sdk/s3-presigned-post`; AWS SDK packages aligned to 3.1161), `checkUploaded` (size + magic bytes via a 16-byte ranged GET; deletes bad files), `deletePrefix` on R2. Browser: `putFile()` (`src/lib/upload-client.ts`). Removed: `/api/uploads`, `/api/files`, `STORAGE_DRIVER`, `UPLOAD_DIR`, `S3_*`, local upload tokens; rich text accepts only https images; custom hosts no longer pass `/api/files`. `fileUrl` returns null while `R2_PUBLIC_URL` is unset. Env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`; the bucket needs a CORS rule (PUT/GET from the app origins incl. localhost:3000, headers content-type and content-disposition). Unit tests use an in-memory R2 (`src/test/fake-r2.ts`); e2e upload steps run only when R2 is configured.
- **Email = Amazon SES only** (owner): `EMAIL_TRANSPORT`, SMTP settings, Nodemailer and Mailpit removed; `renderEmail` moved to `src/server/email/render.ts`. e2e reads emails from the BullMQ email queue. Locally SES needs AWS keys; without them email jobs fail and retry (the app keeps working).
- **Platform admin redesign** (owner feedback): operator console with a dark sidebar (Monitor / Customers), account search in the top bar, overview (stat strip, 30-day signup chart, Free/Pro mix, "Needs attention", recent signups), accounts table with plan pills and status dots, account page (header, plan, usage, people, workspaces, history timeline, danger zone), invite page with "What happens", activity timeline. Admin colours live in `src/app/admin/admin-theme.tsx` (only loaded on /admin).
- **Tests:** 288 unit; e2e green (30–32 passed; the avatar upload test and the billing test skip until R2's public URL / Stripe are set). New: plan normalisation, Free has everything except the three Pro gates, attachment Pro gate, R2 presign signs content type/length, fake-R2 storage tests.

