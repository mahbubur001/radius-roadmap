-- Doc 22 O1: roadmap/idea "categories" are "objectives". Renames only: no data
-- is copied or dropped. Update and article categories get their own tables.
ALTER TABLE "categories" RENAME TO "objectives";--> statement-breakpoint
ALTER TABLE "objectives" RENAME CONSTRAINT "categories_pkey" TO "objectives_pkey";--> statement-breakpoint
ALTER TABLE "objectives" RENAME CONSTRAINT "categories_account_id_organization_id_fk" TO "objectives_account_id_organization_id_fk";--> statement-breakpoint
ALTER TABLE "objectives" RENAME CONSTRAINT "categories_workspace_id_workspaces_id_fk" TO "objectives_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER INDEX "categories_workspace_name_uq" RENAME TO "objectives_workspace_name_uq";--> statement-breakpoint
ALTER TABLE "roadmap_cards" RENAME COLUMN "category_id" TO "objective_id";--> statement-breakpoint
ALTER TABLE "roadmap_cards" RENAME CONSTRAINT "roadmap_cards_category_id_categories_id_fk" TO "roadmap_cards_objective_id_objectives_id_fk";--> statement-breakpoint
ALTER TABLE "feedback_items" RENAME COLUMN "category_id" TO "objective_id";--> statement-breakpoint
ALTER TABLE "feedback_items" RENAME CONSTRAINT "feedback_items_category_id_categories_id_fk" TO "feedback_items_objective_id_objectives_id_fk";--> statement-breakpoint
-- Public display toggle stored in roadmaps.display (jsonb).
UPDATE "roadmaps"
SET "display" = ("display" - 'showCategories') || jsonb_build_object('showObjectives', "display" -> 'showCategories')
WHERE "display" ? 'showCategories';
