CREATE TABLE "account_settings" (
	"account_id" text PRIMARY KEY NOT NULL,
	"branding" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_settings" ADD CONSTRAINT "account_settings_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;