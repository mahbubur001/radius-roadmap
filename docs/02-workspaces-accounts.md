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
