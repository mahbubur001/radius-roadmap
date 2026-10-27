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
