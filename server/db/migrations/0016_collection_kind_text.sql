-- collections.kind becomes text with a check, so a kind can be added and
-- used in the same transaction. The Wishlist index compares kind with an
-- enum value, so it's dropped first and made again on the text column.
DROP INDEX "collections_one_wishlist_idx";--> statement-breakpoint
ALTER TABLE "collections" ALTER COLUMN "kind" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "collections" ALTER COLUMN "kind" SET DATA TYPE text USING "kind"::text;--> statement-breakpoint
ALTER TABLE "collections" ALTER COLUMN "kind" SET DEFAULT 'custom';--> statement-breakpoint
CREATE UNIQUE INDEX "collections_one_wishlist_idx" ON "collections" USING btree ("owner_id") WHERE "collections"."kind" = 'wishlist';--> statement-breakpoint
CREATE UNIQUE INDEX "collections_one_owned_idx" ON "collections" USING btree ("owner_id") WHERE "collections"."kind" = 'owned';--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_kind" CHECK ("collections"."kind" in ('custom', 'wishlist', 'owned'));--> statement-breakpoint
DROP TYPE "public"."collection_kind";
