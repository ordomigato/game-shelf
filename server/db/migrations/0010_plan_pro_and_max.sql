ALTER TABLE "users" DROP CONSTRAINT "users_plan";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_plan" CHECK ("users"."plan" in ('free', 'pro', 'max'));