ALTER TABLE "roadmap_cards" ADD COLUMN "completion_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "roadmap_cards" ADD COLUMN "header_image_key" text;--> statement-breakpoint
ALTER TABLE "roadmaps" ADD COLUMN "internal_summary_json" jsonb;--> statement-breakpoint
ALTER TABLE "roadmaps" ADD COLUMN "public_summary_json" jsonb;--> statement-breakpoint
ALTER TABLE "roadmaps" ADD COLUMN "notify_on_complete" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "roadmaps" ADD COLUMN "internal_display" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
-- Cards completed before this change have been dealt with; don't email them.
UPDATE "roadmap_cards" SET "completion_notified_at" = "completed_at" WHERE "completed_at" IS NOT NULL;--> statement-breakpoint
-- Plain-text summaries become one paragraph per line of Tiptap JSON.
UPDATE "roadmaps" SET "internal_summary_json" = jsonb_build_object('type', 'doc', 'content', (
  SELECT jsonb_agg(CASE WHEN line = '' THEN jsonb_build_object('type', 'paragraph')
    ELSE jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', line))) END ORDER BY n)
  FROM unnest(string_to_array("internal_summary", E'\n')) WITH ORDINALITY AS t(line, n)
)) WHERE coalesce("internal_summary", '') <> '';--> statement-breakpoint
UPDATE "roadmaps" SET "public_summary_json" = jsonb_build_object('type', 'doc', 'content', (
  SELECT jsonb_agg(CASE WHEN line = '' THEN jsonb_build_object('type', 'paragraph')
    ELSE jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', line))) END ORDER BY n)
  FROM unnest(string_to_array("public_summary", E'\n')) WITH ORDINALITY AS t(line, n)
)) WHERE coalesce("public_summary", '') <> '';
