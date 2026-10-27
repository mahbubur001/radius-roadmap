CREATE TYPE "public"."event_type" AS ENUM('page_view', 'card_view', 'vote', 'unvote');--> statement-breakpoint
CREATE TYPE "public"."vote_source" AS ENUM('public', 'embed', 'admin');--> statement-breakpoint
CREATE TABLE "card_features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"card_id" uuid NOT NULL,
	"title" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"position" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_tags" (
	"card_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "card_tags_card_id_tag_id_pk" PRIMARY KEY("card_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"position" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roadmap_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"roadmap_id" uuid NOT NULL,
	"column_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"public_title" text,
	"summary_json" jsonb,
	"summary_text" text DEFAULT '' NOT NULL,
	"category_id" uuid,
	"planned_for" date,
	"is_public" boolean DEFAULT true NOT NULL,
	"completed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"position" text NOT NULL,
	"vote_count" integer DEFAULT 0 NOT NULL,
	"imported_votes" integer DEFAULT 0 NOT NULL,
	"external_ref" text,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce("roadmap_cards"."public_title", "roadmap_cards"."title")), 'A') || setweight(to_tsvector('english', "roadmap_cards"."summary_text"), 'B')) STORED,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roadmap_columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"roadmap_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" text NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"is_done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roadmaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"internal_title" text NOT NULL,
	"public_title" text,
	"internal_summary" text,
	"public_summary" text,
	"is_public" boolean DEFAULT true NOT NULL,
	"position" text NOT NULL,
	"display" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" "event_type" NOT NULL,
	"subject_id" uuid,
	"visitor_id" text,
	"country" text,
	"city" text,
	"source" "vote_source" DEFAULT 'public' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voter_login_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"email" text NOT NULL,
	"code_hash" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voter_login_codes_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"tracked_user_id" uuid,
	"visitor_id" text,
	"ip_hash" text,
	"country" text,
	"city" text,
	"source" "vote_source" DEFAULT 'public' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "card_features" ADD CONSTRAINT "card_features_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_features" ADD CONSTRAINT "card_features_card_id_roadmap_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."roadmap_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_tags" ADD CONSTRAINT "card_tags_card_id_roadmap_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."roadmap_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_tags" ADD CONSTRAINT "card_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_cards" ADD CONSTRAINT "roadmap_cards_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_cards" ADD CONSTRAINT "roadmap_cards_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_cards" ADD CONSTRAINT "roadmap_cards_roadmap_id_roadmaps_id_fk" FOREIGN KEY ("roadmap_id") REFERENCES "public"."roadmaps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_cards" ADD CONSTRAINT "roadmap_cards_column_id_roadmap_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."roadmap_columns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_cards" ADD CONSTRAINT "roadmap_cards_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_cards" ADD CONSTRAINT "roadmap_cards_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_columns" ADD CONSTRAINT "roadmap_columns_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_columns" ADD CONSTRAINT "roadmap_columns_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_columns" ADD CONSTRAINT "roadmap_columns_roadmap_id_roadmaps_id_fk" FOREIGN KEY ("roadmap_id") REFERENCES "public"."roadmaps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmaps" ADD CONSTRAINT "roadmaps_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmaps" ADD CONSTRAINT "roadmaps_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voter_login_codes" ADD CONSTRAINT "voter_login_codes_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_card_id_roadmap_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."roadmap_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_tracked_user_id_tracked_users_id_fk" FOREIGN KEY ("tracked_user_id") REFERENCES "public"."tracked_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_features_card_idx" ON "card_features" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "card_tags_tag_idx" ON "card_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_workspace_name_uq" ON "categories" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "roadmap_cards_account_workspace_idx" ON "roadmap_cards" USING btree ("account_id","workspace_id");--> statement-breakpoint
CREATE INDEX "roadmap_cards_column_idx" ON "roadmap_cards" USING btree ("column_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roadmap_cards_workspace_slug_uq" ON "roadmap_cards" USING btree ("workspace_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "roadmap_cards_roadmap_external_ref_uq" ON "roadmap_cards" USING btree ("roadmap_id","external_ref") WHERE "roadmap_cards"."external_ref" is not null;--> statement-breakpoint
CREATE INDEX "roadmap_cards_search_idx" ON "roadmap_cards" USING gin ("search");--> statement-breakpoint
CREATE INDEX "roadmap_columns_roadmap_idx" ON "roadmap_columns" USING btree ("roadmap_id");--> statement-breakpoint
CREATE INDEX "roadmaps_account_workspace_idx" ON "roadmaps" USING btree ("account_id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roadmaps_workspace_slug_uq" ON "roadmaps" USING btree ("workspace_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_workspace_name_uq" ON "tags" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "events_workspace_created_idx" ON "events" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "voter_login_codes_account_email_idx" ON "voter_login_codes" USING btree ("account_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "votes_card_user_uq" ON "votes" USING btree ("card_id","tracked_user_id") WHERE "votes"."tracked_user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "votes_card_visitor_uq" ON "votes" USING btree ("card_id","visitor_id") WHERE "votes"."tracked_user_id" is null;--> statement-breakpoint
CREATE INDEX "votes_workspace_created_idx" ON "votes" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "votes_visitor_idx" ON "votes" USING btree ("account_id","visitor_id");