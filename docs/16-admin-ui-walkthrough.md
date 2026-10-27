# 16 — LoopedIn Admin Walkthrough (radiustheme account)

Audited: 2026-10-27, logged in as the owner, **read-only**. No settings or data were changed.

## Account facts
- Account **radiustheme**, signed up 19 Jan 2022, **Free plan**, 1 team member (the owner).
- 1 workspace: **Classified Listing**.
- Many features are locked behind Startup, Pro or Enterprise.

## Global layout
- **Left icon sidebar:** workspace switcher (the "C" avatar), Home, Boards, Roadmap, Updates, Articles, then a SETTINGS group with Settings and Public Settings.
- **Top bar:** Upgrade, dark-mode toggle, "Roadmap ↗" and "Updates Feed ↗" (open the public pages), user avatar.
- **Footer:** Support, Knowledge Base, FAQs. LoopedIn's own widget launcher sits at the bottom right with an unread badge.

---

## 1. Home (dashboard)
- "Hey, <name>" greeting + **Configure** button.
- **Roadmap Views:** count with % change, line chart, 7D / 1M / 3M toggle.
- **Sidebar Widget Views:** same layout as above.
- **Activity feed** with geo-tagged anonymous events, for example "Someone from Manchester, GB added a vote MailChimp Integration · a month ago".
- **Latest Feedbacks** (title, age, source "Added from public dashboard").
- **Feedbacks recently voted on** and **Cards recently voted on** (title, last vote time, total votes).

## 2. Boards (feedback / ideas)
- Header: "You have 0 boards remaining" (plan limit). Board tab: **Ideas (62)**.
- ⚠️ **All 62 items are Private with status "New".** Customers submitted them from the public form, nobody approved them, so the public Ideas tab looks empty. **There's a backlog of 62 unreviewed requests.**
- Toolbar:
  - **+ New Feedback**, "Public board" badge, search
  - **Show filters**, **Summary view**
  - **Edit board** (locked on Free)
  - **More** → Import Feedback, Export…
- **List item:**
  - vote box (count)
  - status chip, "Private" label
  - title, summary
  - last updated
  - priority-score badge, comment count
- **Filters panel:**
  - **Sort by:** Most votes, Newest, Oldest, Last updated (newest / oldest), Priority, Effort, Value, Category
  - **Status:** Current / Completed
  - Category, Tags, Roadmap card (linked or not)
  - **Public status:** No preference / Public / Private
  - **Priority score:** Quick wins / Time sinks / No score yet …
  - Votes, Description, My Feedback, Attachments, Comments, Archived status
- **Feedback detail drawer** (`?feedback=<id>`):
  - Vote box, title. Tabs: **General | Attachments | Votes | Comments**
  - Received from (email)
  - **Category** dropdown. This doubles as the *status* (New, To do, Planned, In progress …, plus "Add new")
  - **Public visibility** (Public/Private), Tags
  - Summary: rich editor (bold, italic, underline, paragraph format, align, lists, font size, horizontal rule, link, image, video, emoji, code view)
  - **Impact** and **Effort** sliders (? · XS · S · M · L · XL) → **Priority score**
  - Right-hand actions:
    - Mark as Complete, **Push to Roadmap**, **Add to Roadmap card**
    - Follow, **Merge**, Move to…, Copy to…, Duplicate
    - View public, Archive, Delete
  - Footer: Submitted by (name + email), Created, Last updated

## 3. Roadmap
- Title "Classified Listing".
- Toolbar:
  - Toggle filters, **Completed cards**
  - **Edit Roadmap**, Summary view
  - **More** → Add objectives, Export…, Import roadmap
  - search
- Columns In progress / Up next / Future / Done, each with a **+** button. A card shows an objective chip (inline dropdown), title, description, votes, and 💡 (converted from feedback).
- **Card drawer** (`?card=<id>`), which **autosaves** ("All changes saved"):
  - Tabs: General | **Features** (locked) | **Linked Feedbacks** | Attachments | **Votes** | Comments
  - Summary editor, **Public visibility**, **Objective** (= category), Tags, **Planned for** (date)
  - Actions: Mark as Complete, Follow, Move to…, Copy to…, Duplicate, View public card, Delete
  - "Converted feedback" link back to the source idea
  - Submitted by, Created
  - **Votes tab:** named voters (name + email) **plus "44 anonymous votes"** (on a card with 46). **Most votes are anonymous.**
- **Edit roadmap dialog:**
  - **Internal title / Public title**, **Internal summary / Public summary**
  - Emails: notify card followers on completion (ON)
  - **Columns editor:** rename, **per-column public toggle**, delete, + Add column
  - Public roadmap: ON/OFF + URL
  - Locked on Free: embeddable roadmap, logo, display comments, comments public by default, allow comments, allow follows
  - **Section headings:** rename/hide the Roadmap, Updates and Boards tabs
  - **Internal vs public display toggles:**
    - General: Title, Summary, Tags, Attachments
    - Roadmap cards: Votes, Objectives, Card details, Features, Feature details, Feature progress, Dates, Image headers, Completed cards
    - Board feedback: public by default

## 4. Updates
- Stats: reactions received (7 days, Pro) and **total subscribers** (with "View all").
- **+ New Post**, search, **View subscribers**, **Show recently completed**, More.
- One draft post, "Multi Currency" (New feature, Jun 2022). It links **completed Cards (1)** and **Features (0)**; adding completed cards to announcements is a paid feature.

## 5. Articles (KB)
- Stats: Published Articles, **Likes, Neutrals, Dislikes**, Article Views.
- Settings, Public Site, More. Categories are empty, with a "+ New Category" button.

## 6. Settings (10 sections)

| Section | Contents | Plan |
|---------|----------|------|
| Account Settings | Profile (first, last, email), change password, account logo, favicon, account details (name, **Tax ID, address**), signed-up date, last login, account type, workspace access | favicon Pro |
| Workspace Settings | Name, **Guest Authentication** (require email or social login before vote/comment/submit), **Dark mode** default; logo, favicon, **social share image**, **app translations**, **Index public pages (OFF by default)**, **password protect**, delete workspace | most need Startup |
| Team Members | List + invite (first, last, email, **workspace access**) | — |
| White Labelling | Default font (large Google Fonts list), default color, **Terms URL, Privacy URL, Reply-To email**, custom Terms & Privacy, hide "Powered by", **custom email templates**; **Custom SMTP** tab | Pro |
| Custom Domain | — | Pro |
| Single Sign-On | — | Enterprise |
| User Segmentation | — | Enterprise |
| Categories and tags | Objectives: Onboarding, Increase Engagement, Revenue Growth, User Experience | Startup |
| Integrations | LoopedIn API (Ent), Webhooks (Pro), Jira (Pro), **Pabbly Connect, Zapier, SyncSpider** (available), **Google Analytics, Hotjar, Intercom Chat, Crisp Chat** (script IDs, Pro) | mixed |
| Email Notifications | Admin emails on: new subscribers, new feedback, new comments, new followers; "Show reply button" | — |

## 7. Public Settings (Public Pages / Widgets)
- Sections: **Public Roadmap**, **Standalone Updates Feed**, **Standalone Roadmap Page**, Articles, Boards (managed per board), **Sidebar Widget**, **Popover Widget**.
- Public Roadmap sub-pages: Installation (iframe code), General (title, description, tabs), Colors and logo, **Comments, follows & votes**, Roadmap cards, Updates, Board's feedback.
- **Comments, follows & votes (current values):**

  | Setting | Value |
  |---------|-------|
  | Display comments | **OFF** |
  | Allow comments | **OFF** |
  | Require approval | OFF |
  | Allow followers | **OFF** |
  | Roadmap votes | ON |
  | Idea votes | ON |

  This explains why there are almost no comments.
- **Sidebar widget** (locked on Free). The preview shows a gradient header with "Welcome", a "Latest Update" card, a "View more" button, bottom tabs (Home / Updates / Roadmap / Boards / Articles), and "Powered by LoopedIn".

---

## 8. What this means for our build

| # | Finding | Plan change |
|---|---------|-------------|
| 1 | 62 requests stuck as Private/New, never reviewed | **Triage inbox** for new requests, with an unread count, bulk approve/reject/merge, and email + dashboard alerts. Optional auto-publish per board. |
| 2 | Most votes are **anonymous** (44 of 46) | Anonymous voting is a core feature: **dedupe by a signed visitor cookie + hashed IP** with rate limits. Store a coarse location (city, country) for the activity feed. Workspace setting: "Require login to vote" (= Guest Authentication). |
| 3 | Feedback "Category" is used as the **status** | Separate **status** (New → Under review → Planned → In progress → Done / Declined) from **category**. Both are configurable with colors. |
| 4 | Cards have objectives, tags, **planned-for date**, **features (sub-items with progress)**, **linked feedbacks**, attachments, votes list | Add to the card model: `planned_for`, `card_features` (title, done flag → progress), `card_feedback_links`, attachments, a voters list (named + anonymous count). |
| 5 | **Internal vs public** title and summary; per-field internal/public display toggles; **per-column public toggle** | Model `internal_*` and `public_*` fields, a `column.is_public` flag, and a display-settings JSON per roadmap. |
| 6 | Dashboard: views (7D/1M/3M), widget views, geo activity feed, recent votes | An analytics **events** table (page_view, widget_view, vote, submit) plus daily rollups for the dashboard charts. |
| 7 | Boards and roadmaps have **Import / Export (CSV)** | CSV import/export early. It's also our **migration path**: Free plan, so no API. Use LoopedIn's Export to bring in the 66 cards (and their votes), plus the 62 feedback items. |
| 8 | **Index public pages is OFF by default** in LoopedIn | Our public pages are indexable by default, with a per-workspace switch. |
| 9 | GA / Hotjar / Intercom / Crisp are just script IDs | A generic **"Analytics & chat scripts"** setting (GA4 ID, Hotjar ID, custom head HTML) on public pages. |
| 10 | Comments and follows were off | Comments and follows are **optional per workspace**, default OFF, with an approval option. |
| 11 | Admin rich editor has many tools | Tiptap with: bold, italic, underline, headings, align, lists, horizontal rule, link, image, video embed, emoji, code. |
| 12 | Autosave in drawers | Autosave edits (debounced server action) with a "Saved" indicator. |
| 13 | Merge / Move / Copy / Duplicate / Archive | In scope for the feedback module (merge keeps votes and followers). |
| 14 | Admin notification preferences | Per-member email preferences (new feedback, comments, followers, subscribers). |
