# 25 — Phase 5 plan: Articles (knowledge base)

Status: **APPROVED 2026-10-29** (A1–A7 as recommended). **Built 2026-10-29** (see "As built").

Phase 5 adds LoopedIn's last public module: **Articles**, a help centre / knowledge base for each workspace. It completes the public site's tab row (Roadmap · Updates · Ideas · Articles).

Sources:
- doc 06 (WYSIWYG with images and video, custom categories with counts, featured + recent articles, search, "was this helpful" reactions, SEO, white-label, embeddable)
- doc 15 §6 (public tab: centred search, **Recent articles**, **Categories**, "Nothing published yet.")
- doc 16 §5 (admin: stats **Published articles, Likes, Neutrals, Dislikes, Article views**; "+ New Category")
- doc 22 §1 + §2.5 (Articles get their **own** `article_categories`; same layout as LoopedIn)
- doc 11 (plan limits: 1 / 3 / 5 / ∞ knowledge bases, for Phase 6 billing)

---

## 1. Scope

### In Phase 5
| Area | What ships |
|------|------------|
| Categories | Per-workspace **article categories**: name, description, emoji icon, ordered (drag). Empty by default ("+ New category"), like LoopedIn |
| Articles (admin) | `/dashboard/<workspace>/articles`: stat tiles (Published, Likes, Neutrals, Dislikes, Views 30 days), category sidebar with counts, list (status, category, views, rating), search, **+ New article**. Editor page (autosave, like Updates): title, category, body (`RichTextEditor` with images + video, A7), excerpt (optional, else first lines), **Featured** switch, public/private. Actions: Publish, Unpublish, Duplicate, Delete, View public article. Drag to order articles within a category |
| Public site | **Articles** tab at `/<account>/<workspace>/articles`: centred search, **Featured**, **Recent articles**, **Categories** grid (icon, name, description, count). Category page `/articles/category/<slug>`; article page `/articles/<slug>` (breadcrumb, title, updated date, body, "Was this helpful?", more in this category); search results `/articles?q=`. SEO metadata, sitemap entries, 404/308 in the proxy. Module switch + renamable tab (Public site settings) |
| Ratings | "Was this helpful?" 😞 😐 😀 (dislike / neutral / like), one per visitor, changeable, no sign-in (same visitor id + rate limits as votes and reactions) |
| Views | `article_view` events; Home gets an **Articles** tile (views + helpful %) |
| Video | YouTube / Vimeo embeds in the rich text editor, for articles **and** Updates posts (it was in the Phase 4 plan but not built) |

### Not in Phase 5
- More than one knowledge base per workspace (doc 11 plan limits count workspaces as KBs; Phase 6 billing).
- Widget / iframe embedding of articles (Phase 6 widget).
- Article comments, versions/history, translations, password-protected KBs.
- Article API (LoopedIn has none either).

---

## 2. Decisions needed (my recommendation first)

| # | Question | Recommendation | Alternative |
|---|----------|----------------|-------------|
| A1 | How many knowledge bases | **One per workspace** (the Articles module). Plan limits later count workspaces | Several KBs inside a workspace |
| A2 | Public URLs | **`/articles`, `/articles/category/<slug>`, `/articles/<slug>`**: the article slug is unique per workspace, so moving an article to another category never breaks its link | LoopedIn's `/kb/<category>/<slug>` (link changes when the category changes) |
| A3 | Publishing | **Draft / Published only**: no scheduling, no subscriber emails (help articles aren't news) | Reuse Updates scheduling + emails |
| A4 | Feedback on articles | **"Was this helpful?" 3 faces** (dislike / neutral / like), matching LoopedIn's admin stats | Emoji reactions like Updates |
| A5 | Categories | **Name, description, emoji icon** (no colour), ordered by drag; an article has at most one category ("Uncategorised" otherwise) | Colour chips like Updates |
| A6 | Search | **Postgres full-text** on title + body (weighted), with prefix matching for type-ahead on the public search box | — |
| A7 | Video embeds | **Add `@tiptap/extension-youtube`** (official Tiptap extension, new dependency). The sanitizer allows only `youtube-nocookie.com` and `player.vimeo.com` iframes; Vimeo via a small custom node | No video in Phase 5 |

---

## 3. Data model (migration `0010`)
- `article_categories`: id, account_id, workspace_id, slug (unique per workspace), name, description, icon (one emoji), position, created_at.
- `articles`: id, account_id, workspace_id, category_id (set null), slug (unique per workspace), title, excerpt, body_json, body_text, status `draft | published`, is_public, featured, position (within its category), published_at, created_by, updated_by, created_at, updated_at, search (tsvector, title A + body B).
- `article_ratings`: id, account_id, article_id, value `dislike | neutral | like`, visitor_id or tracked_user_id; unique per (article, voter). Counts cached on `articles` (likes, neutrals, dislikes) in the same transaction, like `vote_count`.
- `events`: new type `article_view` (article id).
- Workspace settings (jsonb, no migration): `showArticles`, `articlesLabel`.

## 4. Services and routes
- `article-categories.ts`, `articles.ts` (CRUD, publish/unpublish, reorder, duplicate; `requireWorkspace` context), `public-articles.ts` (`"use cache"` loaders: index, category, article, search, path status, sitemap), `article-ratings.ts`.
- Public API: `POST /api/public/article-ratings` (`publicRequest`, `hit()` rate limit); `/api/public/me` returns the visitor's own ratings (never cached).
- Every write calls `invalidatePublic(workspaceId)`; the module switch and tab name call `invalidateSite(accountId)`.
- `publicPathStatus` learns `/articles`, `/articles/category/<slug>`, `/articles/<slug>` (404 when missing, private, a draft, or the module is off). Category slugs follow the name when it changes; old category links then 404 (category pages are lists, not linked from emails).
- Tenant tests for every service: another account can't read or change categories, articles or ratings.

## 5. Steps (each: tests, lint, typecheck, commit)
1. **Schema + services:** migration `0010`, Zod schemas in `src/lib/schemas/articles.ts`, services + tests.
2. **Admin:** Articles list, categories dialog (drag order), editor with autosave, publish/unpublish, featured, duplicate, delete, reorder.
3. **Public:** Articles tab (index, category, article, search), module switch + tab label, proxy statuses, sitemap, SEO.
4. **Ratings + views + stats:** "Was this helpful?", `article_view`, admin tiles, Home tile.
5. **Video embeds** (A7) in `RichTextEditor` + sanitizer, used by articles and Updates.
6. **e2e + docs:** write → publish → public index/category/article/search → rate; doc "As built", PROGRESS.

## 6. Done when
- [x] A team member can create categories and articles, publish them, and order them.
- [x] The public Articles tab shows featured, recent, categories and search; drafts and private articles never show.
- [x] Visitors can rate articles once each (changeable); admin and Home show the stats.
- [x] Another account can't read or change anything (tests).
- [x] Checks green (unit, e2e, lint, typecheck, build).

## 7. As built (2026-10-29)

- **Schema (`0010_articles`):** as §3; `event_type` gains `article_view` and `article_rating`. Rating counts are cached on `articles` (likes / neutrals / dislikes) and updated in the rating transaction; a rating never bumps the article's "Updated" date.
- **Services:** `article-categories.ts` (admin-only; slug follows the name), `articles.ts` (slug follows the title until the first publish; "category" is never used as a slug because `/articles/category/…` is the category page; stats window computed in SQL), `public-articles.ts` (`articleIsPublic`, home/category/article loaders, search, path status, sitemap, rateable check), `article-ratings.ts`.
- **Search (A6):** whole words via the stemmed index (`plainto_tsquery('english')`) **or** typed words as prefixes against an unstemmed `simple` vector computed on the fly (stemming breaks prefixes: "sett" vs "set") **or** a title substring. Ranked by the stemmed match. Fine for knowledge-base sizes; add an index if a KB grows to thousands of articles.
- **Admin:** `/dashboard/<ws>/articles` (5 tiles, Published/Drafts tabs, search, category sidebar with counts and Uncategorised, drag to reorder inside a category with the shared `SortableList`), categories dialog (icon, name, description, drag order, delete keeps articles), editor `/articles/[id]` (autosave, Publish/Unpublish, category, excerpt, Featured, Public, Duplicate, Delete).
- **Public:** `/articles` (centred search, Featured, Recent articles, Categories grid; `?q=` shows results), `/articles/category/<slug>` (category sidebar, breadcrumb, ordered list), `/articles/<slug>` (breadcrumb, updated date, body, "Was this helpful?", more in this category). Proxy 404s through `articlePathStatus`; sitemap lists the module and articles. Public site settings: **Articles** switch and tab name.
- **Ratings (A4):** `POST /api/public/article-ratings` (rate limited 60/hour per IP, no sign-in), the visitor's own answers come from `/api/public/me` (`ratings`), never cached.
- **Home:** Article views (period), Published articles, "Articles rated helpful" (% likes of all ratings).
- **Video (A7) change:** instead of `@tiptap/extension-youtube` (YouTube only, stores raw URLs) we built a small `video` node (`src/components/form/video-node.ts`) storing `{ provider, id }` for YouTube and Vimeo; `src/lib/video.ts` parses links and builds `youtube-nocookie` / Vimeo `dnt` player URLs; the server renderer drops anything else; emails get a "Watch the video" link. Works in cards, posts, ideas and articles. **No new dependency.**
- **Fix found on the way:** the editor now sends a plain JSON copy of its document. Tiptap's attrs objects for custom nodes were serialized by server actions as `"$T"` temporary references and lost.
- **Tests:** `articles.test.ts`, `public-articles.test.ts`, `src/lib/video.test.ts`; e2e `e2e/articles.spec.ts`. 207 unit, 27 e2e.
