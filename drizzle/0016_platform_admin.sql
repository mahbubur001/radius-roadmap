CREATE TABLE "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_email" text NOT NULL,
	"action" text NOT NULL,
	"account_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_overrides" (
	"account_id" text PRIMARY KEY NOT NULL,
	"plan" "plan_id" NOT NULL,
	"ends_at" timestamp with time zone,
	"note" text,
	"set_by" text NOT NULL,
	"warned7d_at" timestamp with time zone,
	"warned1d_at" timestamp with time zone,
	"ended_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_settings" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_settings" ADD COLUMN "suspended_reason" text;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_overrides" ADD CONSTRAINT "plan_overrides_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_log_account" ON "admin_audit_log" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_log_created" ON "admin_audit_log" USING btree ("created_at");