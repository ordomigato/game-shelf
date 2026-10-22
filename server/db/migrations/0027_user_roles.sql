ALTER TABLE "users" ADD COLUMN "roles" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
UPDATE "users" SET "roles" = '{admin}' WHERE "reviews_barcodes";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "reviews_barcodes";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_roles" CHECK ("users"."roles" <@ array['admin']::text[]);