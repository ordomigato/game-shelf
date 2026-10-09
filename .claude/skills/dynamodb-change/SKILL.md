---
name: dynamodb-change
description: >
  Use when adding or changing what is stored in DynamoDB: a new attribute on a
  library item, a new item type, a new access pattern, or an index. Walks the
  places a data change has to reach so it works, stays scoped to the signed-in
  user, and doesn't need a destructive table change.
---

# Threading a DynamoDB change all the way through

## The table

`Library` in `sst.config.ts`: `userId` (string, the Cognito `sub`) is the
partition key, `gameId` (number, the IGDB id) is the sort key. Each item is
one game in one user's library, with `status` set to `owned` or `wishlist`
and a snapshot of the game (`name`, `coverId`) so the library renders
without calling IGDB.

Every read is a `Query` on one `userId`. Never `Scan` the table from a
request handler.

## Order of work

1. **Design the access pattern first.** Write down the question the UI asks
   ("all wishlisted games for this user, newest first") and check the
   existing key answers it. Filtering a single user's items in a `Query` is
   fine at this size. Add a global index only when it can't be answered
   that way.
2. **The TypeScript type** for the item in `server/utils/`, shared by every
   route that touches it.
3. **One server util per operation** (`getLibrary`, `setGameStatus`, …) in
   `server/utils/` using `@aws-sdk/lib-dynamodb` and
   `Resource.Library.name`. Routes call these. They don't build DynamoDB
   commands inline.
4. **User scoping.** The `userId` always comes from the verified Cognito
   token in the request, never from the body, query or route params.
5. **Validation.** Validate the request with `readValidatedBody` /
   `getValidatedQuery` before it reaches DynamoDB. Cap string lengths.
6. **Existing items.** Reading code tolerates a missing new attribute. Don't
   write a backfill unless the user asks.
7. **The composable and UI** in `app/`. See `ui-conventions` and
   `plain-language`.

## Changes that replace the table

Changing a key (`userId`, `gameId`, or their types) replaces the table and
deletes its data. Production has deletion protection, so the deploy fails
instead. Don't work around that. Stop and talk to the user. A new global
index is safe to add.
