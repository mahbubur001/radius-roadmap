CREATE TYPE "public"."roadmap_stage" AS ENUM('review', 'planned', 'in_progress');--> statement-breakpoint
ALTER TABLE "roadmap_columns" ADD COLUMN "stage" "roadmap_stage" DEFAULT 'planned' NOT NULL;--> statement-breakpoint
-- Doc 30 R2: guess each existing column's stage from its name (done columns are shipped anyway).
UPDATE "roadmap_columns" SET "stage" = 'in_progress' WHERE NOT "is_done" AND "name" ~* '(progress|doing|now|building|develop|current|started|active)';--> statement-breakpoint
UPDATE "roadmap_columns" SET "stage" = 'review' WHERE NOT "is_done" AND "stage" = 'planned' AND "name" ~* '(review|consider|idea|backlog|future|later|someday|exploring|research|evaluat|under)';
