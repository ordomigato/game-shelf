ALTER TABLE "users" ADD COLUMN "roles" text[] DEFAULT '{user}'::text[] NOT NULL;--> statement-breakpoint
UPDATE "users" SET "roles" = '{user,admin}' WHERE "reviews_barcodes";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_roles" CHECK ("users"."roles" <@ array['user','admin']::text[] and 'user' = any("users"."roles"));
