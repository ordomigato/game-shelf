ALTER TABLE "users" ADD COLUMN "owned_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "wishlist_public" boolean DEFAULT false NOT NULL;