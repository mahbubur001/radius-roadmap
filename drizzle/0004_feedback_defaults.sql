-- Default feedback board + statuses for workspaces created before Phase 3
-- (same values as seedFeedback in src/server/services/feedback-boards.ts).
INSERT INTO "feedback_statuses" ("account_id", "workspace_id", "name", "color", "kind", "position")
SELECT w."account_id", w."id", s."name", s."color", s."kind"::"feedback_status_kind", s."position"
FROM "workspaces" w
CROSS JOIN (VALUES
  ('New', '#64748b', 'open', 'a0'),
  ('Under review', '#0891b2', 'open', 'a1'),
  ('Planned', '#7c3aed', 'planned', 'a2'),
  ('In progress', '#2563eb', 'in_progress', 'a3'),
  ('Done', '#16a34a', 'done', 'a4'),
  ('Declined', '#dc2626', 'declined', 'a5')
) AS s("name", "color", "kind", "position")
WHERE NOT EXISTS (SELECT 1 FROM "feedback_statuses" f WHERE f."workspace_id" = w."id");
--> statement-breakpoint
INSERT INTO "feedback_boards" ("account_id", "workspace_id", "slug", "name", "position")
SELECT w."account_id", w."id", 'feature-requests', 'Feature requests', 'a0'
FROM "workspaces" w
WHERE NOT EXISTS (SELECT 1 FROM "feedback_boards" b WHERE b."workspace_id" = w."id");
