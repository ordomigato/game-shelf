CREATE TYPE "public"."collection_kind" AS ENUM('custom', 'wishlist');--> statement-breakpoint
CREATE TABLE "blueprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text,
	"shared" boolean DEFAULT false NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_items" (
	"collection_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_items_collection_id_item_id_pk" PRIMARY KEY("collection_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "library_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"igdb_id" integer,
	"name" text NOT NULL,
	"cover_id" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN "blueprint_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN "slug" text NOT NULL;--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN "kind" "collection_kind" DEFAULT 'custom' NOT NULL;--> statement-breakpoint
ALTER TABLE "blueprints" ADD CONSTRAINT "blueprints_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_item_id_library_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."library_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blueprints_owner_id_idx" ON "blueprints" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "collection_items_item_id_idx" ON "collection_items" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "library_items_owner_id_idx" ON "library_items" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "library_items_igdb_id_idx" ON "library_items" USING btree ("igdb_id");--> statement-breakpoint
CREATE UNIQUE INDEX "library_items_owner_igdb_idx" ON "library_items" USING btree ("owner_id","igdb_id") WHERE "library_items"."igdb_id" is not null;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_blueprint_id_blueprints_id_fk" FOREIGN KEY ("blueprint_id") REFERENCES "public"."blueprints"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "collections_owner_slug_idx" ON "collections" USING btree ("owner_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "collections_one_wishlist_idx" ON "collections" USING btree ("owner_id") WHERE "collections"."kind" = 'wishlist';