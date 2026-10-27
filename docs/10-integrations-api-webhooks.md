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
