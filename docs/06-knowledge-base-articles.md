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
