ALTER TYPE "public"."notification_frequency" ADD VALUE 'weekly';--> statement-breakpoint
CREATE TABLE "vote_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"card_id" uuid,
	"feedback_id" uuid,
	"milestone" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vote_milestones_one_target_check" CHECK (num_nonnulls("vote_milestones"."card_id", "vote_milestones"."feedback_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "votes" "notification_frequency";--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "review_reminder" "notification_frequency";--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "replies" "notification_frequency";--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "weekly_summary" "notification_frequency";--> statement-breakpoint
ALTER TABLE "vote_milestones" ADD CONSTRAINT "vote_milestones_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote_milestones" ADD CONSTRAINT "vote_milestones_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote_milestones" ADD CONSTRAINT "vote_milestones_card_id_roadmap_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."roadmap_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote_milestones" ADD CONSTRAINT "vote_milestones_feedback_id_feedback_items_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vote_milestones_card_uq" ON "vote_milestones" USING btree ("card_id","milestone") WHERE "vote_milestones"."card_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "vote_milestones_feedback_uq" ON "vote_milestones" USING btree ("feedback_id","milestone") WHERE "vote_milestones"."feedback_id" is not null;--> statement-breakpoint
CREATE INDEX "vote_milestones_workspace_created_idx" ON "vote_milestones" USING btree ("workspace_id","created_at");