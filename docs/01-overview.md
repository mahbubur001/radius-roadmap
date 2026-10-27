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
