CREATE TYPE "public"."plan_id" AS ENUM('free', 'startup', 'pro', 'enterprise');--> statement-breakpoint
CREATE TABLE "account_billing" (
	"account_id" text PRIMARY KEY NOT NULL,
	"plan" "plan_id" DEFAULT 'free' NOT NULL,
	"interval" text,
	"status" text,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_billing_stripeCustomerId_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "account_billing_stripeSubscriptionId_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_billing" ADD CONSTRAINT "account_billing_account_id_organization_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;