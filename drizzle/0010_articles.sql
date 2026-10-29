CREATE TYPE "public"."article_rating_value" AS ENUM('dislike', 'neutral', 'like');--> statement-breakpoint
CREATE TYPE "public"."article_status" AS ENUM('draft', 'published');--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE 'article_view';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE 'article_rating';--> statement-breakpoint
CREATE TABLE "article_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"icon" text DEFAULT '📄' NOT NULL,
	"position" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "article_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"article_id" uuid NOT NULL,
	"value" "article_rating_value" NOT NULL,
	"tracked_user_id" uuid,
	"visitor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_ratings_voter_check" CHECK (num_nonnulls("article_ratings"."tracked_user_id", "article_ratings"."visitor_id") >= 1)
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"category_id" uuid,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"body_json" jsonb,
	"body_text" text DEFAULT '' NOT NULL,
	"status" "article_status" DEFAULT 'draft' NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"position" text NOT NULL,
	"published_at" timestamp with time zone,
	"likes" integer DEFAULT 0 NOT NULL,
	"neutrals" integer DEFAULT 0 NOT NULL,
	"dislikes" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"updated_by" text,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', "articles"."title"), 'A') || setweight(to_tsvector('english', "articles"."body_text"), 'B')) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "article_categories" ADD CONSTRAINT "article_categories_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_categories" ADD CONSTRAINT "article_categories_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_ratings" ADD CONSTRAINT "article_ratings_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_ratings" ADD CONSTRAINT "article_ratings_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_ratings" ADD CONSTRAINT "article_ratings_tracked_user_id_tracked_users_id_fk" FOREIGN KEY ("tracked_user_id") REFERENCES "public"."tracked_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_category_id_article_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."article_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "article_categories_workspace_slug_uq" ON "article_categories" USING btree ("workspace_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "article_categories_workspace_name_uq" ON "article_categories" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "article_ratings_user_uq" ON "article_ratings" USING btree ("article_id","tracked_user_id") WHERE "article_ratings"."tracked_user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "article_ratings_visitor_uq" ON "article_ratings" USING btree ("article_id","visitor_id") WHERE "article_ratings"."tracked_user_id" is null;--> statement-breakpoint
CREATE INDEX "articles_account_workspace_idx" ON "articles" USING btree ("account_id","workspace_id");--> statement-breakpoint
CREATE INDEX "articles_workspace_status_idx" ON "articles" USING btree ("workspace_id","status","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "articles_workspace_slug_uq" ON "articles" USING btree ("workspace_id","slug");--> statement-breakpoint
CREATE INDEX "articles_search_idx" ON "articles" USING gin ("search");