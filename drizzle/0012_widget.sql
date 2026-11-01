ALTER TYPE "public"."feedback_source" ADD VALUE 'widget';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE 'widget_view';--> statement-breakpoint
ALTER TYPE "public"."vote_source" ADD VALUE 'widget';--> statement-breakpoint
CREATE TABLE "widget_keys" (
	"account_id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "widget_keys" ADD CONSTRAINT "widget_keys_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;