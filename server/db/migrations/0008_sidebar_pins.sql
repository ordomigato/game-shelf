CREATE TABLE "pinned_collections" (
	"user_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"position" double precision NOT NULL,
	CONSTRAINT "pinned_collections_user_id_collection_id_pk" PRIMARY KEY("user_id","collection_id")
);
--> statement-breakpoint
ALTER TABLE "pinned_collections" ADD CONSTRAINT "pinned_collections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pinned_collections" ADD CONSTRAINT "pinned_collections_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pinned_collections_collection_id_idx" ON "pinned_collections" USING btree ("collection_id");--> statement-breakpoint
-- Everyone starts with their Wishlist pinned. They can unpin it.
INSERT INTO "pinned_collections" ("user_id", "collection_id", "position")
SELECT "owner_id", "id", 1 FROM "collections" WHERE "kind" = 'wishlist'
ON CONFLICT DO NOTHING;
