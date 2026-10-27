# 18 — Phase 1 plan: Accounts, workspaces & team

Status: **APPROVED 2026-10-27** (all §2 recommendations, D1–D5). **BUILT 2026-10-27**; see "As built" below.

Phase 0 gave us sign-up, onboarding (one account + one workspace) and an empty dashboard shell. Phase 1 makes an account usable by a real team:
- several workspaces, with a switcher
- teammates with roles and per-workspace access
- profile, account and workspace settings
- file uploads for logos and avatars
- the `tracked_users` (voter) data model that Phase 2 builds on

Sources: doc 02 (accounts/workspaces/teammates), doc 08 (end-user auth), doc 16 §6 (LoopedIn settings) and §8, doc 15 §9.

---

## 1. Scope

### In Phase 1
| Area | What ships |
|------|------------|
| Workspaces | Switcher in the sidebar; create, rename, change slug, delete (type the name to confirm); remember the last-used workspace |
| Accounts | Switch account (a user can belong to several); account settings (name, slug, logo); the `/` redirect handles invited users with no active account |
| Team | Members list; invite (email, role, workspace access); pending invites (resend, cancel); change role; remove member; leave account; transfer ownership |
| Workspace access | Owners and admins see every workspace; members see only the workspaces they've been given |
| Profile | Name, avatar, change email (verified), change password, sign out other sessions |
| Workspace settings | Name, slug, logo, plus the switches stored in `workspaces.settings` (require voter login, dark mode default, index public pages). Most of these switches only take effect in Phase 2 |
| Uploads | A storage layer with a `local` driver (dev) and an `s3` driver (prod); images only, with size limits |
| Voters | `tracked_users` + `tracked_user_sessions` tables and a service, with tenant-isolation tests. **No UI**: Phase 2 builds the sign-in flows on top |
| Plan limits | A `getPlanLimits(accountId)` hook that returns "unlimited" for now. It's wired into invites and workspace creation so Phase 6 billing only fills it in |

### Not in Phase 1
- Notification preferences: Phase 3/4, when the emails they control exist.
- Delete the whole account: Phase 6, together with billing cancellation.
- 2FA, SSO and SAML: Later.
- White-label, custom domain and custom SMTP settings: Phase 6.
- The public site URL scheme (subdomain vs path): decided in the Phase 2 plan.

---

## 2. Decisions needed (my recommendation first)

Owner chose the recommendation for every row (2026-10-27).

| # | Question | Recommendation | Alternative |
|---|----------|----------------|-------------|
| D1 | Who can see which workspace? | **Per-member access list** (like LoopedIn's "workspace access" on invite). Owners and admins see everything | Every teammate sees every workspace (simpler, but agencies can't separate clients) |
| D2 | Uploads now or later? | **Now**, with a `local` driver so dev needs no AWS, plus an `s3` driver with presigned PUT | Skip logos and avatars until Phase 6 |
| D3 | Change email in Phase 1? | **Yes**: Better Auth `changeEmail` sends a verification to the new address | Later |
| D4 | Password rule | **Keep "at least 10 characters"** (length beats composition rules, per NIST) | Copy LoopedIn: 12+ characters with upper, lower and a symbol |
| D5 | Who can invite? | **Owners and admins**. Only an owner can create or change another owner | Admins can also manage owners |

---

## 3. Data model

### 3.1 `workspace_members` (new)
Members' access to workspaces. Owners and admins have implicit access and need no rows.

| Column | Type | Notes |
|--------|------|-------|
| `account_id` | text → `organization.id` (cascade) | tenant scope |
| `workspace_id` | uuid → `workspaces.id` (cascade) | |
| `user_id` | text → `user.id` (cascade) | |
| `created_at` | timestamptz | |

The primary key is `(workspace_id, user_id)`, with an index on `(account_id, user_id)`. Removing someone from the account deletes their rows in the same transaction, done in the member-removal service.

### 3.2 Better Auth: invitation extra field
- `organization({ schema: { invitation: { additionalFields: { workspaceIds: { type: "string[]", input: true, required: false } } } } })`.
- On accept, the `organizationHooks.afterAcceptInvitation` hook copies `workspaceIds` into `workspace_members`. It only copies workspaces that still exist in that account.
- Better Auth's accept handler already checks the invited email matches the signed-in user, that the email is verified, and that the invite hasn't expired, then makes that account active.
- After the change, regenerate the auth schema (`pnpm auth:generate`) → `pnpm db:generate`.

### 3.3 `organization` extra fields
`logo` already exists. No new columns in Phase 1; Tax ID and address wait for billing.

### 3.4 `user`
`image` (Better Auth's column) holds the avatar's storage key.

### 3.5 `tracked_users` (new: voters / end users, never in Better Auth tables)
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | |
| `account_id` | text → organization (cascade) | voters belong to the account and work across its workspaces |
| `kind` | enum `guest` \| `email` \| `social` \| `sso` \| `widget` | how they were last identified. `email` = magic link (verified) |
| `email` | text, nullable | stored lowercased |
| `email_verified_at` | timestamptz, nullable | set by magic link, social or SSO |
| `name` | text, nullable | |
| `avatar_url` | text, nullable | |
| `external_id` | text, nullable | customer SSO `sub`/id, or widget `user.id` |
| `metadata` | jsonb | segment data from the widget or SSO (company, plan, …) |
| `created_at`, `last_seen_at` | timestamptz | |

- Unique `(account_id, email)` where email is not null.
- Unique `(account_id, external_id)` where external_id is not null.
- **Anonymous voters are not rows.** Votes (Phase 2) store a hashed visitor id + hashed IP, per doc 16 §8 #2.
- **Merging identities:** when a guest later verifies the same email, the row is updated in place (kind → `email`, `email_verified_at` set). A guest email never overwrites a verified row's name.

### 3.6 `tracked_user_sessions` (new)
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | |
| `account_id` | text | |
| `tracked_user_id` | uuid → tracked_users (cascade) | |
| `token_hash` | text, unique | SHA-256 of the random cookie token; the raw token is never stored |
| `expires_at` | timestamptz | 30 days ("remember me", doc 15 §9) |
| `created_at` | timestamptz | |

The cookie is set per public host in Phase 2. Phase 1 only builds the service: `createSession`, `getSessionByToken`, `revokeSession`.

---

## 4. Server code

### 4.1 Context and access
- `requireAccount()` (exists) → if the session has no active account but the user has memberships, set the first one active instead of redirecting to onboarding.
- `requireWorkspace(slug)` → also checks access. A member without a `workspace_members` row gets the same "not found" as a missing workspace.
- `requireRole(ctx, "admin")` helper for settings and team actions. `assertRole` already exists in `services/context.ts`.
- A small `action()` wrapper for server actions:
  - parse the input with a Zod schema
  - run the tenant/role gate
  - map `ForbiddenError`/`NotFoundError`/`ZodError` to `{ ok: false, error }`
  - catch everything else and log it

  This keeps each action to a few lines and identical in shape.

### 4.2 Services (all `(db, ctx, …)`, all scoped by `ctx.accountId`)
| Service | Functions |
|---------|-----------|
| `workspaces` | `listWorkspaces` (now filtered by access for members), `getWorkspaceBySlug` (checks access), `createWorkspace` (+ plan limit), `updateWorkspace`, `deleteWorkspace` (owner/admin; can't delete the last one) |
| `team` | `listMembers` (with workspace access), `setWorkspaceAccess`, `changeRole`, `removeMember`, `transferOwnership`. Better Auth's endpoints do the member/invite writes; this service adds our rules and the workspace-access rows |
| `invitations` | `listInvitations`, `invite` (→ `auth.api.createInvitation` with `workspaceIds`), `resend`, `cancel` |
| `accounts` | `updateAccount` (name, slug, logo), `listMyAccounts`, `switchAccount` |
| `tracked-users` | `upsertTrackedUser`, `getTrackedUser`, the session functions in §3.6 |
| `plan-limits` | `getPlanLimits(accountId)` → `{ workspaces: Infinity, teammates: Infinity }`; plugged into Better Auth `membershipLimit` and `createWorkspace` |

### 4.3 Role rules (enforced in services, tested)
- Owner: everything. Only an owner can invite or promote someone to owner, demote or remove an owner, or transfer ownership.
- Admin: invite and manage members and admins, edit account and workspace settings, create and delete workspaces.
- Member: their own profile only; works inside the workspaces they can access (Phase 2+).
- An account must always keep at least one owner. You can't remove or demote yourself if you're the last owner.

### 4.4 Storage (`src/server/storage`)
- `STORAGE_DRIVER=local|s3` in `env.ts` and `.env.example`, plus `S3_BUCKET` and `S3_PUBLIC_URL` (the CloudFront URL later).
- Flow:
  1. A server action validates the type (PNG, JPEG or WebP only; no SVG, because it can carry scripts) and size (2 MB), then returns a signed upload URL.
  2. The client PUTs the file.
  3. A second action saves the key.
- Keys: `accounts/<accountId>/<purpose>/<uuid>.<ext>`, so a tenant can never write outside its prefix.
- `local` driver:
  - Upload: a route handler `PUT /api/uploads/[...key]` checks an HMAC-signed, short-lived token and writes to `.uploads/` (gitignored).
  - Serve: `GET /api/files/[...key]`.
- `s3` driver: `@aws-sdk/s3-request-presigner` presigned PUT; public read through the bucket/CloudFront URL.
- New dependencies: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`.

### 4.5 Email
New template `email-changed` (verification to the new address). The `invitation` template is updated to say which workspaces they get. Both go through the existing queue.

---

## 5. UI

### Sidebar and header
- The "R" logo becomes a **workspace switcher**: workspace avatar, a dropdown of accessible workspaces, and "New workspace" for admins.
- The user menu gets **"Switch account"** when the user has more than one account.
- A `last_workspace` cookie makes `/` go to the last-used workspace.

### Settings (`/[workspace]/settings/...`) with a left sub-nav
| Page | Who | Contents |
|------|-----|----------|
| `profile` | everyone | name, avatar, email (change + verify), password, sessions ("sign out other devices") |
| `account` | admin+ | account name, account slug (with a warning), logo |
| `workspace` | admin+ | name, slug, logo, the 3 switches, danger zone: delete workspace |
| `team` | admin+ (members see a read-only list) | members table (avatar, name, email, role, workspaces, joined) with row actions; "Invite" dialog (email, role, workspace checkboxes); pending invitations tab with resend/cancel |

Members who open an admin page see a 403 page, not a redirect.

### Invite acceptance (existing `/accept-invite/[id]`, finished)
- **Signed out:** shows "Sign in" / "Create account". Both carry `callbackURL=/accept-invite/<id>`, and sign-up prefills the email.
- **Signed in with the wrong email:** an explanation plus "sign out and switch".
- **After accepting:** goes to the first workspace the user can access.

All forms use React Hook Form with the shared Zod schemas, re-checked on the server; shadcn components; autosave is not needed here (explicit Save buttons).

---

## 6. Tests

### Vitest (service level, test DB)
- `workspace_members`: a member only lists and opens granted workspaces; owners and admins see all; there's no access across accounts.
- `team`: role rules from §4.3 (admin can't touch an owner, the last owner can't leave or be demoted, member can't invite); removing a member deletes their workspace access.
- `invitations`: `afterAcceptInvitation` writes only workspace ids that belong to the inviting account (ids from another account are ignored).
- `tracked-users`:
  - same email in two accounts makes two rows
  - an account A context can't read account B's voter or session
  - a guest becomes verified when they later verify the same email
  - an expired session isn't returned
- `storage`: key prefix enforcement; a bad or expired signed token is rejected (local driver).

### Playwright
1. The owner invites `teammate@…` with access to workspace A only.
2. The teammate opens the link from `.dev-mail/`, signs up, verifies, accepts, and lands on A.
3. The teammate doesn't see B in the switcher, and `/B` returns not-found.
4. The teammate opening `settings/team` sees read-only/403.
5. The owner creates, renames and deletes a workspace through the UI.

---

## 7. Build order (each step leaves `check`, `typecheck` and `test` green)
1. Schema: `workspace_members`, `tracked_users`, `tracked_user_sessions`, the invitation `workspaceIds` field → generate + migrate.
2. Context/access changes (`requireAccount`, `requireWorkspace`, `requireRole`, `action()` wrapper) + `plan-limits` stub + tests.
3. Workspace service additions + switcher + create/rename/delete UI.
4. Team and invitations services + Better Auth hooks + team settings page + updated accept-invite page.
5. Storage layer (local, then S3) + logo and avatar uploads.
6. Profile, account and workspace settings pages.
7. Tracked-users service + tests (no UI).
8. Playwright team flow; update CLAUDE.md, doc 14 (new env vars and deps) and PROGRESS.md.

## As built (2026-10-27): differences from the plan
- **Email change:** the *current* address approves first (Better Auth `sendChangeEmailConfirmation`, template `change-email`); then Better Auth sends a verification link to the new address. This is safer than verifying only the new address.
- **Uploads use presigned POST, not PUT:** a presigned PUT can't enforce a size limit; POST uses a `content-length-range` condition. The local driver accepts the same form at `POST /api/uploads` and checks an HMAC token and the image's magic bytes. Files are served from `GET /api/files/...`.
- **Team writes bypass Better Auth's org endpoints:** our services write `member`/`invitation` rows, and Better Auth's HTTP endpoints for those writes are switched off with `disabledPaths`. Accepting still uses Better Auth (`afterAcceptInvitation` → `grantInvitedWorkspaces`).
- **Last workspace** is remembered by `src/proxy.ts` (cookie `last_workspace`). Members with no workspaces land on `/no-access`.
- **Voter function** is named `identifyTrackedUser` (plan: `upsertTrackedUser`).
- **Shared helpers:** `src/server/action.ts` (the `action()` wrapper), `src/test/factories.ts` (test accounts and users), `src/lib/safe-next.ts` (`?next=` redirects).

## Done when
- [x] An owner can invite a teammate with a role and specific workspaces; the teammate signs up through the link and sees only those workspaces.
- [x] Owners and admins can create, rename, re-slug and delete workspaces; everyone can switch workspaces (and accounts, if they have several).
- [x] Role rules in §4.3 are enforced on the server and covered by tests.
- [x] Profile, account and workspace settings save, including logo and avatar uploads (local driver works with no AWS).
- [x] `tracked_users` and sessions exist with service + isolation tests.
- [x] `pnpm lint`, `typecheck`, `test`, `test:e2e` and `build` pass.
