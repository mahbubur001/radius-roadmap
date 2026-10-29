ALTER TABLE "feedback_items" ADD COLUMN "notified_status_id" uuid;--> statement-breakpoint
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_notified_status_id_feedback_statuses_id_fk" FOREIGN KEY ("notified_status_id") REFERENCES "public"."feedback_statuses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Nobody has been told about current statuses yet; start from them so only
-- later changes are emailed.
UPDATE "feedback_items" SET "notified_status_id" = "status_id";
