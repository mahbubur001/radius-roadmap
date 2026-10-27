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
