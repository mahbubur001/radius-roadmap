CREATE TYPE "public"."comment_review" AS ENUM('approved', 'pending');--> statement-breakpoint
CREATE TYPE "public"."feedback_review" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."feedback_source" AS ENUM('public', 'embed', 'admin', 'import');--> statement-breakpoint
CREATE TYPE "public"."feedback_status_kind" AS ENUM('open', 'planned', 'in_progress', 'done', 'declined');--> statement-breakpoint
CREATE TYPE "public"."notification_frequency" AS ENUM('instant', 'daily', 'off');--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE 'feedback_view';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE 'feedback_submit';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE 'comment';--> statement-breakpoint
CREATE TABLE "card_feedback_links" (
	"account_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"feedback_id" uuid NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_feedback_links_card_id_feedback_id_pk" PRIMARY KEY("card_id","feedback_id")
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"feedback_id" uuid NOT NULL,
	"body" text NOT NULL,
	"author_tracked_user_id" uuid,
	"author_user_id" text,
	"is_internal" boolean DEFAULT false NOT NULL,
	"review" "comment_review" DEFAULT 'approved' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "feedback_boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_public" boolean DEFAULT true NOT NULL,
	"auto_publish" boolean DEFAULT false NOT NULL,
	"position" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"board_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary_json" jsonb,
	"summary_text" text DEFAULT '' NOT NULL,
	"status_id" uuid NOT NULL,
	"category_id" uuid,
	"is_public" boolean DEFAULT true NOT NULL,
	"review" "feedback_review" DEFAULT 'pending' NOT NULL,
	"impact" smallint,
	"effort" smallint,
	"vote_count" integer DEFAULT 0 NOT NULL,
	"imported_votes" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"author_tracked_user_id" uuid,
	"author_user_id" text,
	"source" "feedback_source" DEFAULT 'admin' NOT NULL,
	"merged_into_id" uuid,
	"completed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"external_ref" text,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', "feedback_items"."title"), 'A') || setweight(to_tsvector('english', "feedback_items"."summary_text"), 'B')) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_items_impact_check" CHECK ("feedback_items"."impact" is null or "feedback_items"."impact" between 1 and 5),
	CONSTRAINT "feedback_items_effort_check" CHECK ("feedback_items"."effort" is null or "feedback_items"."effort" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "feedback_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"kind" "feedback_status_kind" NOT NULL,
	"position" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_tags" (
	"feedback_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "feedback_tags_feedback_id_tag_id_pk" PRIMARY KEY("feedback_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"account_id" text NOT NULL,
	"feedback_id" uuid NOT NULL,
	"tracked_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_feedback_id_tracked_user_id_pk" PRIMARY KEY("feedback_id","tracked_user_id")
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"account_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"new_feedback" "notification_frequency" NOT NULL,
	"new_comment" "notification_frequency" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_user_id_workspace_id_pk" PRIMARY KEY("user_id","workspace_id")
);
--> statement-breakpoint
ALTER TABLE "votes" ALTER COLUMN "card_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "votes" ADD COLUMN "feedback_id" uuid;--> statement-breakpoint
ALTER TABLE "card_feedback_links" ADD CONSTRAINT "card_feedback_links_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_feedback_links" ADD CONSTRAINT "card_feedback_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_feedback_links" ADD CONSTRAINT "card_feedback_links_card_id_roadmap_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."roadmap_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_feedback_links" ADD CONSTRAINT "card_feedback_links_feedback_id_feedback_items_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_feedback_links" ADD CONSTRAINT "card_feedback_links_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_feedback_id_feedback_items_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_tracked_user_id_tracked_users_id_fk" FOREIGN KEY ("author_tracked_user_id") REFERENCES "public"."tracked_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_boards" ADD CONSTRAINT "feedback_boards_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_boards" ADD CONSTRAINT "feedback_boards_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_board_id_feedback_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."feedback_boards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_status_id_feedback_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."feedback_statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_author_tracked_user_id_tracked_users_id_fk" FOREIGN KEY ("author_tracked_user_id") REFERENCES "public"."tracked_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_merged_into_id_feedback_items_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."feedback_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_statuses" ADD CONSTRAINT "feedback_statuses_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_statuses" ADD CONSTRAINT "feedback_statuses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_tags" ADD CONSTRAINT "feedback_tags_feedback_id_feedback_items_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_tags" ADD CONSTRAINT "feedback_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_feedback_id_feedback_items_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_tracked_user_id_tracked_users_id_fk" FOREIGN KEY ("tracked_user_id") REFERENCES "public"."tracked_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_feedback_links_feedback_idx" ON "card_feedback_links" USING btree ("feedback_id");--> statement-breakpoint
CREATE INDEX "comments_feedback_created_idx" ON "comments" USING btree ("feedback_id","created_at");--> statement-breakpoint
CREATE INDEX "comments_workspace_review_idx" ON "comments" USING btree ("workspace_id","review");--> statement-breakpoint
CREATE INDEX "feedback_boards_account_workspace_idx" ON "feedback_boards" USING btree ("account_id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_boards_workspace_slug_uq" ON "feedback_boards" USING btree ("workspace_id","slug");--> statement-breakpoint
CREATE INDEX "feedback_items_account_workspace_idx" ON "feedback_items" USING btree ("account_id","workspace_id");--> statement-breakpoint
CREATE INDEX "feedback_items_board_review_idx" ON "feedback_items" USING btree ("workspace_id","board_id","review");--> statement-breakpoint
CREATE INDEX "feedback_items_inbox_idx" ON "feedback_items" USING btree ("workspace_id","review","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_items_workspace_slug_uq" ON "feedback_items" USING btree ("workspace_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_items_workspace_external_ref_uq" ON "feedback_items" USING btree ("workspace_id","external_ref") WHERE "feedback_items"."external_ref" is not null;--> statement-breakpoint
CREATE INDEX "feedback_items_search_idx" ON "feedback_items" USING gin ("search");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_statuses_workspace_name_uq" ON "feedback_statuses" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "feedback_tags_tag_idx" ON "feedback_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "follows_tracked_user_idx" ON "follows" USING btree ("tracked_user_id");--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_feedback_id_feedback_items_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "votes_feedback_user_uq" ON "votes" USING btree ("feedback_id","tracked_user_id") WHERE "votes"."tracked_user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "votes_feedback_visitor_uq" ON "votes" USING btree ("feedback_id","visitor_id") WHERE "votes"."tracked_user_id" is null;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_one_target_check" CHECK (num_nonnulls("votes"."card_id", "votes"."feedback_id") = 1);