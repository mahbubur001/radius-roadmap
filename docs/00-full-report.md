# LoopedIn — Full Report

Combined from docs 01–13. Researched 2026-10-27 from public sources only (the admin app was not inspected).

# 01 — Overview

## What it is

LoopedIn is a "customer feedback loop" tool. A product team uses it to:

1. **Collect** ideas and feedback from customers (feedback boards, widgets).
2. **Prioritize** them (votes, impact/effort scoring).
3. **Plan** and show the plan publicly (roadmap).
4. **Announce** what shipped (changelog / updates, emails, in-app widget).
5. **Support** users with self-service docs (articles / knowledge base).

Target users: product teams, agencies, marketing teams, consultancies. It positions itself against Trello (more product-focused) and Beamer / AnnounceKit (changelog plus roadmap and ideas).

## Modules

| Module | Admin name | Public-facing | Purpose |
|--------|-----------|---------------|---------|
| Feedback | Feedback boards (Ideas merged into these in April 2025) | Public / private boards | Customers submit and vote on requests |
| Roadmaps | Roadmap | Public roadmap (tabs) | Kanban of planned / in-progress / done work |
| Changelogs | Updates (API: `updates`, webhooks: `announcement.*`) | Updates feed, sidebar/popover widget, emails | Ship announcements |
| Articles | Knowledge Base | Public KB | Help docs |

All modules live inside a **Workspace** (one per product/project/client). Branding, the custom domain, user management and SSO are set at the **Account** level.

## The core loop (how the pieces connect)

```
Customer ──submit/vote──▶ Feedback / Idea
                             │  (merge duplicates, categorize, score impact+effort)
                             ▼
                      "Push to Roadmap" ──▶ Roadmap Card (column = status)
                                               │ (followers + voters get emailed)
                                               ▼
                                    Card marked Complete
                                               │ prompt: "Create Update post?"
                                               ▼
                                         Update post ──▶ feed, widget, email (segmented)
                                               │
                                               ▼
                               Customers react (emoji), comment, give feedback ──▶ loop
```

Linking rules observed:
- An Idea pushed to the roadmap stays **linked** to the card (votes/followers carry over).
- Ideas can be **added to an existing card** (`idea.added_to_card` event).
- Feedback can be **converted to an idea** or **pushed to roadmap** directly.
- Completing a card prompts you to create an Update post.

## Main entities (inferred from the API and webhooks)

| Entity | Key fields / notes |
|--------|--------------------|
| Account | company; holds the domain, SSO, teammates, billing |
| Workspace | `id`; container for all modules |
| Feedback board | per workspace; public or private |
| Feedback | votes, comments, sentiment, status (completed) |
| Idea | `title`, category, public flag, archived, completed, impact, effort |
| Roadmap | per workspace; columns |
| Roadmap card | `title`, `column`, `objective` (category), public, archived, completed, Jira ID, linked ideas, "features" sub-items |
| Update | `title`, `category`, `status` (draft/published), pinned, public, segment |
| Article | KB content, categories, featured |
| Comment | on ideas / cards / updates |
| Subscriber | email follower of updates / cards / ideas |
| Tracked user | identified end user (name, email, segment props), unlimited on all plans |

## Surfaces

- **Admin app**: `app.loopedin.io` (internal views of every module plus settings).
- **Public pages**: `app.loopedin.io/<account-slug>` or a custom domain; tabs = Roadmap, Updates, Ideas, Feedback (plus KB).
- **iFrame embeds** of the public pages.
- **JS widgets**: Sidebar and Popover (updates feed with reactions and feedback).
- **Email** notifications (custom templates, custom SMTP).
- **REST API** plus **webhooks**.


---

# 02 — Accounts, Workspaces, Teammates

## Account vs Workspace

| | Account | Workspace |
|---|---|---|
| Represents | A company | A product, project, initiative, team, or client |
| Owns | Custom domain (one per account), user/teammate management, SSO, billing, branding | Ideas, Feedback, Roadmap, Updates, Articles |
| Count | One, plus agency sub-accounts | Free/Startup: 1, Pro: 5, Enterprise: unlimited |

- All workspaces are reachable through the account's single custom domain.
- A **domain per workspace is not supported**; one domain per account.
- **Agencies** can either use one workspace per client (separate branding and permissions) or an Agency plan with **sub-accounts**. KB: "How to add multiple accounts?", "How to delete a sub-account?".

## Workspace operations (KB)

- What is a Workspace?
- Adding a new Workspace
- Renaming a Workspace
- Deleting a Workspace

## Teammates

- Internal users invited to the account can view and work on roadmaps, ideas, and so on.
- Limits: Free 1, Startup 3, Pro 5, Enterprise unlimited.
- **Tracked users** (your customers) are unlimited on all plans.

## Admin signup and login (for LoopedIn admins)

- Sign up with Google, or with email ("Get started").
- Email verification uses a 6-digit code.
- Password: at least 12 characters, not equal to the username, with an uppercase letter, a lowercase letter, and a special character.
- Login offers "Remember for 30 days" and "Forgot password".

## Workspace ID

Needed for the widget and API. Find it under Public Settings → Sidebar Widget → Installation, or via `GET /workspaces`.


---

# 03 — Feedback & Ideas

> In April 2025 LoopedIn merged **Ideas into Feedback Boards** (per the API changelog). The KB and API still use both terms. Treat "idea" as an item on a feedback board.

## Feedback boards

- Multiple boards per workspace (plan-limited: 1 / 3 / 5 / unlimited).
- **Public** or **private** (internal or sensitive topics).
- Shown on the public page under the Ideas / Feedback tabs, embeddable via iFrame or widget.

## What end users can do

| Action | Notes |
|--------|-------|
| Submit idea / feedback | Can be anonymous, guest, social sign-in, or SSO-identified |
| Vote | Upvote. Anonymous voting is supported. Webhooks: `vote_added` / `vote_removed` |
| Comment | Startup plan and up |
| Follow | Email notifications on progress |
| Emoji react | Startup plan and up |
| Attach files / video | PDFs, wireframes, hosted video embeds |

## What admins can do

- **Approve new ideas** before they appear publicly (moderation queue).
- **Display ideas as public by default**, or mark individual ideas **private**.
- **Custom categories** with hex colors.
- **Merge** duplicates (keeps votes and followers).
- **Copy / duplicate** items.
- **Archive**, mark **completed**.
- **Convert feedback → idea** (`feedback.converted_to_idea`).
- **Push to Roadmap**: creates a linked roadmap card (`idea.pushed_to_roadmap`), or **add to an existing card** (`idea.added_to_card`).
- **Publish to Jira** as an Epic or Story (see [10](10-integrations-api-webhooks.md)).
- **Sentiment analysis**: feedback is auto-labelled positive, neutral, or negative.
- **Dashboards / analytics** on feedback.
- **CSV export**.
- **AI tools** (marketed, no detail given).

## Prioritization: Effort/Impact matrix

Each idea has two sliders, **Impact** and **Effort**, editable in the Quick Details modal or on the idea page.

- **Priority Score = Impact + Effort**, range **2–10**. Effort appears to be scored inversely, so low effort gives more points.

| Score | Bucket |
|-------|--------|
| 8–10 | Quick Wins |
| 5–7 | Maybe |
| 2–4 | Time Sinks |

The matrix shows four quadrants:

| | Low effort | High effort |
|---|---|---|
| **High impact** | Quick Wins (do first) | Big Bets (keep few) |
| **Low impact** | Incremental (batch them) | Time Sinks (consider stopping) |

## Webhook events

`idea.created|updated|deleted|completed|pushed_to_roadmap|added_to_card|vote_added|vote_removed`
`feedback.created|updated|deleted|completed|converted_to_idea|pushed_to_roadmap|vote_added|vote_removed`


---

# 04 — Roadmaps

## Basics

- Kanban-style board with **drag and drop**, used for product plans, kanban, or marketing plans.
- Multiple roadmaps per workspace (1 / 3 / 5 / unlimited by plan).
- Public or private. Individual **cards** and **columns** can be private.
- **Flexible columns** act as statuses (for example Planned, In Progress, Coming Soon, Completed), renamable.

## Roadmap card

| Field | Notes |
|-------|-------|
| `title` | required |
| `column` | required (status) |
| `objective` | required in API; the card's category ("Roadmap Objectives", with colors) |
| description | WYSIWYG, images, video, attachments |
| public / private | per card |
| completed / archived | flags |
| Jira ID | a card can be looked up by its Jira ID |
| linked ideas | from "Push to Roadmap" / "Add to card" |
| features | sub-items (`/roadmap-cards/{id}/feature` CRUD) |
| votes, comments, followers | public interaction |

Create a card either with the **"+"** on a column (title plus optional objective) or by pushing an idea to the roadmap.

When a card is **completed**, the app prompts you to create an **Update post** from it. Voters and followers get emailed (Pro).

## Settings

- **Edit roadmap** opens a settings modal. Most settings come in two versions: an **internal view** and a **public view**.
- Public roadmap settings live at `app.loopedin.io/public-pages`.

## Public roadmap (KB articles)

- Custom colors on the public roadmap.
- Switch off specific **tabs** (Roadmap / Updates / Ideas / Feedback).
- Re-order and rename tabs.
- Display or hide **completed cards**.
- Switch off the public roadmap **header**.
- Embed as an iFrame (KB: "How to make my iFrame full height?"), or use a standalone page.
- **Subscribe link** for a roadmap card, idea, or updates page.

## Other

- Voting on cards, analytics, email notifications, CSV export, copy/duplicate.

## Webhook events

`roadmap_card.created|updated|deleted|completed|vote_added|vote_removed`


---

# 05 — Changelog / Updates / Announcements

Naming: the marketing site says "Changelogs", the app and API say "Updates", and webhooks say `announcement.*`.

## Posts

| Field | Notes |
|-------|-------|
| `title` | required |
| `category` | required; custom "Update Categories" with colors |
| body | WYSIWYG plus HTML, images, GIFs, video, attachments |
| `status` | `draft` (default) or `published` |
| public / private | private posts are supported |
| `pinned` | pinned to the top of the feed (Pro) |
| segment | target audience |
| scheduled | marketed on the home page as "scheduled posts" |

Create a post from **Updates → Add post**, or from a **completed roadmap card**.

## Distribution channels

1. **Public updates feed**: a tab on the public page, or a standalone changelog page.
2. **Widgets**: Sidebar or Popover in your app, showing the latest updates (see [07](07-public-pages-widgets.md)).
3. **Email notifications** to subscribers, with customizable templates, white-label, and custom SMTP.
4. **iFrame embed**.

## User segmentation (Enterprise)

- Pass custom properties from your app through the widget `segment` object (for example `plan`, `language`, `role`, `location`). All values must be strings.
- Target posts and notifications to matching segments only.

## Engagement

- Emoji reactions (`announcement.emoji_response_received`).
- Feedback/responses on a post (`announcement.response_received`).
- Comments.
- Subscribe / unsubscribe via a public API endpoint, no auth: `POST /updates/public-subscribe` and `POST /updates/public-unsubscribe`.

## Webhook events

`announcement.created|updated|published|deleted|response_received|emoji_response_received`, plus `subscriber.new|lost`


---

# 06 — Articles / Knowledge Base

The newest module ("New" on the marketing site). LoopedIn's own help center (`app.loopedin.io/loopedin/kb`) is built with it.

## Features

- Advanced **WYSIWYG** editor (HTML, images, video embeds).
- **Categories** (custom). The public KB shows category cards with article counts.
- **Featured articles** and a "recent articles" list.
- **Search**.
- **Emoji reactions** on articles (was this helpful).
- **SEO optimisation** (KB: "How to index my pages so that search engines discover them?").
- Fully **white-labelled**, custom fonts, custom domain.
- Embeddable via widget or iFrame.
- Plan limits: 1 / 3 / 5 / unlimited knowledge bases.
- **No API yet** ("Coming soon" in the API docs).

## Public KB structure (observed)

```
/<account>/kb                       → category grid + recent articles + search
/<account>/kb/<category-slug>       → article list
/<account>/kb/<category>/<slug>     → article page (title, date, body, reactions)
```

LoopedIn's own KB has 10 categories and 53 articles: Workspaces (5), Roadmaps (7), Ideas (4), Updates (2), Integrations (5), White-Label (10), Widgets (7), Users (2), Authentication (3), Misc. (8).


---

# 07 — Public Pages, Embeds & Widgets

LoopedIn offers three ways to put content in front of users.

## 1. White-labelled public pages

- URL: `app.loopedin.io/<account-slug>` or your custom domain.
- Tabs: **Roadmap, Updates, Ideas, Feedback** (plus the KB). Each tab can be toggled, renamed, and re-ordered.
- Configured at `app.loopedin.io/public-pages`.
- Options: dark mode, multi-language/translations, password protection (Pro), hide header, show completed cards, custom colors.
- Standalone pages, for example a changelog-only page.

## 2. iFrame embeds

- Copy the embed code or a direct link from Public Pages settings.
- To make the iframe full height, see the KB article on that.
- To sign users in inside an iframe, append `?token=<SSO_JWT>` to the iframe URL.

## 3. JavaScript widgets (`app.loopedin.io/embed`)

Two types: **Sidebar** (slide-out panel) and **Popover**. Both show the latest Update posts.

Widget settings:
- Colors for the launcher icon and slide-out header.
- Launcher icon: the default is a bell; you can replace it with your logo.
- Show or hide the logo.
- Display emoji reactions.
- Enable feedback on posts.
- Custom selector: open the widget from any HTML element instead of the bell.

### Config

```js
var li_sidebar = {
  workspace_id: "123456789",   // required
  auto_init: true,              // default true; if false call LoopedIn.sidebar.init()
  name: "Alex Smith",           // optional, identifies user for feedback/reactions
  email: "alex@example.com",    // optional
  segment: {                    // optional, Enterprise segmentation, string values only
    plan: "pro",
    onboarded: "true"
  }
};
```

### JS API

| Method | Action |
|--------|--------|
| `LoopedIn.sidebar.init()` | Initialize (when `auto_init: false`) |
| `LoopedIn.sidebar.show()` | Open |
| `LoopedIn.sidebar.hide()` | Close |
| `LoopedIn.sidebar.toggle()` | Toggle |

### Widget KB topics

- React / single-page app installation
- Custom selector for the Sidebar and the Popover
- Widget not showing (troubleshooting)
- Sites with a CSP (allowlisting)
- Cloudflare 404 on `/cdn-cgi/challenge-platform/...`
- Works on any platform that allows custom HTML or header scripts (Webflow, ClickUp, WordPress, and others)


---

# 08 — End-User Authentication

How your customers identify themselves on public pages and widgets:

| Method | Plan | Notes |
|--------|------|-------|
| Anonymous | all | Anonymous feedback and voting |
| Guest sign-in | Free+ | Name and email |
| Widget identify | — | Pass `name` / `email` in the widget config |
| Social sign-in | Pro+ | For example Google |
| Password protection | Pro+ | Whole public site behind a shared password |
| Single Sign-On (JWT) | Enterprise | See below |
| SAML | Enterprise (assumed) | KB article dated 30 May 2023 |

## JWT SSO flow

1. An unauthenticated user tries to vote, comment, or submit and clicks **Log in**.
2. LoopedIn redirects to your **Login URL** with a `returnURL` parameter.
3. Your site authenticates the user and signs a JWT with **HS256** using the **SSO Key** from LoopedIn settings. The payload must include `email` and `name`.
4. Your site redirects to `${returnURL}?token=${jwt}`.
5. LoopedIn validates the token and the user is logged in.

Setup: copy the SSO key, enter the Login URL, click **Test URL**, then toggle **Enable SSO**.

```js
const jwt = require('jsonwebtoken');
const token = jwt.sign({ email: user.email, name: user.name }, SSO_KEY, { algorithm: 'HS256' });
res.redirect(`${req.query.returnURL}?token=${token}`);
```

For iframes, append `?token=USER_TOKEN` to the iframe src.

The docs say nothing about token expiry, extra claims, or key rotation.


---

# 09 — White-Label & Branding

## Branding (Startup+ for logo, Pro+ for full white-label)

- **Account settings**: logo and favicon.
- **App settings**: default app color (menus, buttons, headers) and default font (Google Fonts).
- **Custom fonts** (Pro).
- Category and status colors (hex) for roadmap objectives, update categories, and idea categories.
- Turn off **"Powered by LoopedIn"** (Pro).
- Dark mode.

## Custom domain (Pro+)

- Set up through a **CNAME** mapping. SSL is provided.
- **One domain per account**, covering all workspaces. No per-workspace domains.
- A Cloudflare-specific setup guide exists.

## Custom SMTP

- Send notification emails from your own mail server and domain. KB: "Configure Custom SMTP", "How do Custom SMTP work?".
- Email templates are customizable.

## Translations

- Public-facing pages can be translated (multi-language). KB: "Can I translate LoopedIn into different languages?"

## Analytics

- Google Analytics can be added to public pages.


---

# 10 — Integrations, API & Webhooks

## Integrations (Pro+)

- **Jira Cloud**: push ideas to Jira as an Epic (not for Next-Gen projects) or a Story. The title, description, and tags sync **one way, LoopedIn → Jira**, and you can re-sync. Setup uses an OAuth application link (public key, consumer key "productstash"), then project mappings (workspace → Jira project) and content mappings. Custom field mapping is supported. Cards can be fetched by Jira ID.
- **Intercom**, **Zapier**, **Pabbly Connect**, **Sync Spider**, **WordPress**. "1,000+ tools" via Zapier and similar.
- **Google Analytics**.

## REST API (Enterprise)

- Base URL: `https://api.loopedin.io/v1`
- Auth header: `Authorization: Bearer <API_KEY>`. Keys are created at `app.loopedin.io/settings/api`.
- Rate limit: 100 requests per minute per IP (429 when exceeded). CORS is enabled on public endpoints.

| Resource | Endpoints |
|----------|-----------|
| Account | `GET /account` |
| Workspaces | `GET /workspaces`, `GET /workspaces/{id}` |
| Roadmaps | `GET /roadmaps`, `GET /roadmaps/{id}` |
| Roadmap cards | `GET/POST /roadmap-cards`, `GET/PUT /roadmap-cards/{id}` (id or Jira ID). Filters: `workspace_id`, `completed`, `public`, `archived`, `category`, `sort` |
| Card features | `GET/POST /roadmap-cards/{id}/feature`, `GET/PUT/DELETE /roadmap-cards/{id}/feature/{fid}` |
| Ideas | `GET/POST /ideas`, `GET/PUT/DELETE /ideas/{id}` |
| Updates | `GET/POST /updates`, `GET/PUT/DELETE /updates/{id}`, `POST /updates/public-subscribe`, `POST /updates/public-unsubscribe` (no auth) |
| Feedback boards | `GET /feedback-boards`, `GET /feedback-boards/{id}`, `GET /feedback-boards/{id}/feedback` |
| Feedback | `GET /feedback/{id}` |
| Articles | coming soon |

Errors: 400, 401, 403, 404, 429, 500, 503.

## Webhooks (Pro+)

- Created in the UI at `app.loopedin.io/settings/webhooks` with a title, URL, and selected events.
- Payload: `{ event, date, data }`.
- 33 events:
  - **Idea (8):** created, updated, deleted, completed, pushed_to_roadmap, added_to_card, vote_added, vote_removed
  - **Roadmap card (6):** created, updated, deleted, completed, vote_added, vote_removed
  - **Announcement (6):** created, updated, published, deleted, response_received, emoji_response_received
  - **Feedback (8):** created, updated, deleted, completed, converted_to_idea, pushed_to_roadmap, vote_added, vote_removed
  - **Comment (3):** created, updated, deleted
  - **Subscriber (2):** new, lost

## Data export

- CSV export of content.


---

# 11 — Pricing & Plans

Monthly prices. Annual billing saves 20%. Payments go through Stripe. Upgrades are prorated, and cancellation keeps paid features until the end of the billing period.

| | Free | Startup | Pro ⭐ | Enterprise |
|---|---|---|---|---|
| Price | $0 | $12 | $24 | $40 |
| Teammates | 1 | 3 | 5 | ∞ |
| Workspaces | 1 | 1 | 5 | ∞ |
| Feedback boards | 1 | 3 | 5 | ∞ |
| Roadmaps | 1 | 3 | 5 | ∞ |
| Updates feeds | 1 | 3 | 5 | ∞ |
| Knowledge bases | 1 | 3 | 5 | ∞ |
| Tracked users | ∞ | ∞ | ∞ | ∞ |

## Feature gating (each plan includes the ones before it)

- **Free:** voting, guest sign-in, public board/roadmap/updates/KB.
- **Startup:** your logo, widgets, embeddable roadmaps, custom categories, emoji reactions, commenting, following.
- **Pro:** white-labelling, custom fonts, custom domain, integrations, pinned posts, email notifications, webhooks, social sign-in, password protection.
- **Enterprise:** API access, user segmentation, SSO.

The comparison table also lists these without a plan: dark mode, anonymous voting, iFrame embeds, standalone pages, private columns, multi-language.

An **Agency plan** with sub-accounts is mentioned in the FAQ but isn't on the pricing page.


---

# 12 — Official FAQ (summarized)

- **Who is it for?** Product teams, agencies, marketing teams, and consultancies.
- **Core components?** Feedback, roadmaps, and announcements. Each feature can be toggled on or off.
- **Multiple websites?** Yes. Boards, roadmaps, updates, and widgets can be embedded anywhere.
- **Multiple clients?** Use one workspace per client, or an Agency plan with sub-accounts.
- **Workspace vs account?** Account = company (domain, users, SSO). Workspace = product or project.
- **Custom domain?** Yes, via CNAME. Only one per account.
- **Internal sharing?** Invite colleagues as teammates.
- **Replace the bell icon?** Yes, launch the widget from any HTML element.
- **Webflow / ClickUp?** Yes, if the platform allows custom HTML or scripts.
- **SSO instead of anonymous feedback?** Yes.
- **Rename roadmap tabs?** Yes. Tabs can be renamed, re-ordered, or hidden.
- **Free?** Yes, there's a free-forever plan.
- **Browsers?** Latest Chrome (recommended), Safari, Firefox, Edge, and Brave.
- **Compared with Trello?** More product-focused, with ideas and updates built in.
- **Compared with Beamer / AnnounceKit?** Simpler updates, plus a roadmap and ideas.


---

# 13 — Gaps & Next Steps

## Not verified

The **logged-in admin app** at `app.loopedin.io` was not inspected:
- The Chrome browser extension was not connected during research.
- The assistant does not type passwords into third-party production sites. The account owner has to log in themselves, and the assistant can browse after that.

So the following come from public docs only, not from the live UI:
- Exact admin navigation, menu names, and screen layouts.
- The full settings list (roadmap settings modal, public pages settings, widget settings).
- The analytics/dashboard contents and the "AI tools".
- How sentiment analysis, scheduling, and segmentation are configured in the UI.
- How "Ideas" and "Feedback" look after the April 2025 merge.

Some pages also returned errors: `loopedin.io/how-it-works` returned HTTP 525.

## To complete the audit

1. Connect Claude in Chrome. Log in to `app.loopedin.io` yourself in that Chrome window.
2. Ask the assistant to walk through every admin page. It will screenshot and document the sidebar nav, each module's list/detail views, every settings page, the widget builder, and the public pages.
3. Add a `14-admin-ui-walkthrough.md` with screenshots.


---

