CREATE TYPE "public"."tracked_user_kind" AS ENUM('guest', 'email', 'social', 'sso', 'widget');--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"account_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "tracked_user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"tracked_user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracked_user_sessions_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "tracked_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"kind" "tracked_user_kind" NOT NULL,
	"email" text,
	"email_verified_at" timestamp with time zone,
	"name" text,
	"avatar_url" text,
	"external_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "workspace_ids" text[];--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "logo" text;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_user_sessions" ADD CONSTRAINT "tracked_user_sessions_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_user_sessions" ADD CONSTRAINT "tracked_user_sessions_tracked_user_id_tracked_users_id_fk" FOREIGN KEY ("tracked_user_id") REFERENCES "public"."tracked_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_users" ADD CONSTRAINT "tracked_users_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_members_account_user_idx" ON "workspace_members" USING btree ("account_id","user_id");--> statement-breakpoint
CREATE INDEX "tracked_user_sessions_user_idx" ON "tracked_user_sessions" USING btree ("tracked_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tracked_users_account_email_uq" ON "tracked_users" USING btree ("account_id","email") WHERE "tracked_users"."email" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "tracked_users_account_external_id_uq" ON "tracked_users" USING btree ("account_id","external_id") WHERE "tracked_users"."external_id" is not null;