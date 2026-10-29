CREATE TYPE "public"."reaction_emoji" AS ENUM('thumbs_up', 'heart', 'tada', 'eyes');--> statement-breakpoint
CREATE TYPE "public"."subscriber_source" AS ENUM('public', 'voter', 'import');--> statement-breakpoint
CREATE TYPE "public"."subscriber_status" AS ENUM('pending', 'active', 'unsubscribed');--> statement-breakpoint
CREATE TYPE "public"."suppression_reason" AS ENUM('unsubscribed_all', 'bounce', 'complaint');--> statement-breakpoint
CREATE TYPE "public"."update_status" AS ENUM('draft', 'scheduled', 'published');--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE 'update_view';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE 'reaction';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE 'subscribe';--> statement-breakpoint
CREATE TABLE "email_suppressions" (
	"account_id" text NOT NULL,
	"email" text NOT NULL,
	"reason" "suppression_reason" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_suppressions_account_id_email_pk" PRIMARY KEY("account_id","email")
);
--> statement-breakpoint
CREATE TABLE "update_cards" (
	"update_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	CONSTRAINT "update_cards_update_id_card_id_pk" PRIMARY KEY("update_id","card_id")
);
--> statement-breakpoint
CREATE TABLE "update_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"position" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "update_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"update_id" uuid NOT NULL,
	"emoji" "reaction_emoji" NOT NULL,
	"tracked_user_id" uuid,
	"visitor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "update_reactions_voter_check" CHECK (num_nonnulls("update_reactions"."tracked_user_id", "update_reactions"."visitor_id") >= 1)
);
--> statement-breakpoint
CREATE TABLE "update_subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"tracked_user_id" uuid,
	"status" "subscriber_status" DEFAULT 'pending' NOT NULL,
	"token_hash" text NOT NULL,
	"source" "subscriber_source" DEFAULT 'public' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"body_json" jsonb,
	"body_text" text DEFAULT '' NOT NULL,
	"cover" text,
	"category_id" uuid,
	"status" "update_status" DEFAULT 'draft' NOT NULL,
	"publish_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"is_public" boolean DEFAULT true NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"email_subscribers" boolean DEFAULT true NOT NULL,
	"emailed_at" timestamp with time zone,
	"created_by" text,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', "updates"."title"), 'A') || setweight(to_tsvector('english', "updates"."body_text"), 'B')) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "new_subscriber" "notification_frequency" DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_suppressions" ADD CONSTRAINT "email_suppressions_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "update_cards" ADD CONSTRAINT "update_cards_update_id_updates_id_fk" FOREIGN KEY ("update_id") REFERENCES "public"."updates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "update_cards" ADD CONSTRAINT "update_cards_card_id_roadmap_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."roadmap_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "update_categories" ADD CONSTRAINT "update_categories_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "update_categories" ADD CONSTRAINT "update_categories_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "update_reactions" ADD CONSTRAINT "update_reactions_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "update_reactions" ADD CONSTRAINT "update_reactions_update_id_updates_id_fk" FOREIGN KEY ("update_id") REFERENCES "public"."updates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "update_reactions" ADD CONSTRAINT "update_reactions_tracked_user_id_tracked_users_id_fk" FOREIGN KEY ("tracked_user_id") REFERENCES "public"."tracked_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "update_subscribers" ADD CONSTRAINT "update_subscribers_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "update_subscribers" ADD CONSTRAINT "update_subscribers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "update_subscribers" ADD CONSTRAINT "update_subscribers_tracked_user_id_tracked_users_id_fk" FOREIGN KEY ("tracked_user_id") REFERENCES "public"."tracked_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "updates" ADD CONSTRAINT "updates_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "updates" ADD CONSTRAINT "updates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "updates" ADD CONSTRAINT "updates_category_id_update_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."update_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "updates" ADD CONSTRAINT "updates_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "update_cards_card_idx" ON "update_cards" USING btree ("card_id");--> statement-breakpoint
CREATE UNIQUE INDEX "update_categories_workspace_name_uq" ON "update_categories" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "update_reactions_user_uq" ON "update_reactions" USING btree ("update_id","emoji","tracked_user_id") WHERE "update_reactions"."tracked_user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "update_reactions_visitor_uq" ON "update_reactions" USING btree ("update_id","emoji","visitor_id") WHERE "update_reactions"."tracked_user_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "update_subscribers_workspace_email_uq" ON "update_subscribers" USING btree ("workspace_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "update_subscribers_token_uq" ON "update_subscribers" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "update_subscribers_workspace_status_idx" ON "update_subscribers" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "updates_account_workspace_idx" ON "updates" USING btree ("account_id","workspace_id");--> statement-breakpoint
CREATE INDEX "updates_workspace_status_idx" ON "updates" USING btree ("workspace_id","status","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "updates_workspace_slug_uq" ON "updates" USING btree ("workspace_id","slug");--> statement-breakpoint
CREATE INDEX "updates_search_idx" ON "updates" USING gin ("search");--> statement-breakpoint
-- Default update categories for existing workspaces (doc 15 §9 #5; same
-- values as DEFAULT_UPDATE_CATEGORIES in src/server/services/update-categories.ts).
INSERT INTO "update_categories" ("account_id", "workspace_id", "name", "color", "position")
SELECT w."account_id", w."id", c."name", c."color", c."position"
FROM "workspaces" w
CROSS JOIN (VALUES
  ('New feature', '#16a34a', 'a0'),
  ('Improvement', '#2563eb', 'a1'),
  ('Fix', '#dc2626', 'a2'),
  ('Maintenance', '#64748b', 'a3'),
  ('Announcement', '#7c3aed', 'a4'),
  ('Coming soon', '#d97706', 'a5')
) AS c("name", "color", "position")
WHERE NOT EXISTS (SELECT 1 FROM "update_categories" u WHERE u."workspace_id" = w."id");
