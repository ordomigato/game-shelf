---
name: igdb
description: >
  Use whenever touching game search, game details, cover art, or any server
  route that talks to IGDB with Twitch credentials. Covers why IGDB calls
  must go through the server, what a route may and may not accept from the
  browser, IGDB's rate limits, and how cover image URLs are built.
---

# Talking to IGDB

## Why it goes through the server

IGDB (owned by Twitch) needs two things the browser can't provide:

1. An app access token from `https://id.twitch.tv/oauth2/token` using the
   client credentials grant. That needs `TWITCH_CLIENT_SECRET`.
2. A server-side caller. `api.igdb.com` sends no CORS headers, so a browser
   `fetch` to it fails no matter what it carries.

So every IGDB call goes browser → Nuxt server route in `server/api/` →
IGDB. Shared IGDB code (token cache, request helper) lives in
`server/utils/`, which Nitro auto-imports into server routes.

## What a route may accept

A route takes **structured, validated parameters** and builds the IGDB query
(Apicalypse) itself: a search term, a list of numeric ids, a page number.
Validate them with `getValidatedQuery` or `readValidatedBody`. A route must
never:

- Forward a raw Apicalypse body from the browser. That turns it into an open
  proxy for anyone's use of your IGDB quota, and string-built queries are
  injectable (`search "<term>"` with an unescaped `"` in the term).
- Return the Twitch access token or secret.
- Set permissive CORS headers. The site and its API share an origin.

Escape `"` and `\` in a search term before it goes into `search "...";`, cap
its length, and clamp `limit` on the server.

## Limits

- 4 requests per second per client id, at most 8 open at once. Search fires
  on submit or with a debounce, not on every keystroke.
- At most 500 results per request. Ask for the fields the UI renders, not
  `fields *`.
- A token lasts about 60 days. Cache it in module scope with an early expiry
  (it survives across warm Lambda invocations) and refetch once on a 401
  instead of failing the request.

## Cover images

```
https://images.igdb.com/igdb/image/upload/t_<size>/<image_id>.jpg
```

Request `cover.image_id` in the query. Common sizes: `t_cover_small`,
`t_cover_big`, `t_cover_big_2x`. A game with no cover has no `cover` field,
so render a placeholder rather than a broken image.

## Storing games

A library entry stores a small snapshot of the game (`name`, `coverId`)
alongside the user's status, so the library page renders without calling
IGDB at all. Don't fetch from IGDB per tile on page load.
