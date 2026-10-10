---
name: observability
description: >
  Use when adding logging, measuring latency or traffic, reading logs to
  investigate slowness or errors, or touching the request log, Server-Timing
  header, Web Vitals reporting or IGDB/database timing. Covers what is logged,
  the privacy rules for logs, and the CloudWatch Logs Insights queries that
  read them.
---

# Observability: hits, latency and how pages feel

GameShelf follows the common baseline for web services: **rate, errors and
duration** per route on the server (read as percentiles, p50/p95/p99, not
averages), and **Core Web Vitals** from real visits in the browser. All of it
is JSON log lines, so it costs nothing beyond CloudWatch Logs' free tier.

## What gets logged

All lines go through `log()` in `server/utils/log.ts`.

- **`http.request`**, one per request, from `server/plugins/request-log.ts`:
  `method`, `route` (a pattern like `/api/games/:id`, from
  `server/utils/route-label.ts`), `status`, `durationMs`, `coldStart` (the
  Lambda instance's first request), and `dbQueries`/`dbMs` and
  `igdbCalls`/`igdbMs`. Build files and `/api/vitals` are skipped.
  - `dbMs` and `igdbMs` add up every call's time, so they can exceed
    `durationMs` when calls run in parallel (`Promise.all`).
  - Database time is measured on Neon's HTTP fetch (`server/utils/db.ts`).
    IGDB time includes fetching the Twitch token (`server/utils/igdb.ts`).
    Both reach the request through Nitro's request context
    (`nitro.experimental.asyncContext`, `server/utils/request-timing.ts`).
  - A page rendered on the server that calls its own API (like Explore's
    `$fetch('/api/explore')`) logs two lines: the page and the API call.
- **`Server-Timing` header** on every response: `total`, `db` and `igdb`
  durations. Browser dev tools show it under the request's Timing tab.
- **`web.vital`**, from `app/plugins/web-vitals.client.ts` via
  `POST /api/vitals`: `name` (LCP, INP, CLS, FCP, TTFB), `value` (ms, except
  CLS, which is a score), `rating`, the landing page's `route`, and
  `device` (mobile or desktop). A sample of visits reports
  (`runtimeConfig.public.vitalsSampleRate`, 25% by default, set with
  `NUXT_PUBLIC_VITALS_SAMPLE_RATE`). To test, set localStorage
  `gameshelf:vitals` to `always`.
- **Existing events:** `igdb.slow`, `igdb.rate_limited`, `twitch.*`,
  `server.error` (unexpected errors only), `preview.failed`.

## Privacy rules for logs

- Never log the query string, search text, tokens, secrets or anything
  someone typed. Routes are patterns, so ids, usernames and slugs don't end
  up in logs either.
- No user ids in request or vitals lines. They're for performance, not for
  following people.
- `/api/vitals` takes no sign-in. Its body is capped (10 metrics, values up
  to 120 s) so it can't be used to write arbitrary text into the logs. If it's
  ever abused, rate-limit it at CloudFront rather than in the app.

## Reading it

Locally, `sst dev` prints every line in its terminal. On AWS, use
CloudWatch Logs Insights on the site's Lambda log group.

Hits and latency per route, slowest tail first:

```
fields route, durationMs
| filter event = "http.request"
| stats count() as hits,
        pct(durationMs, 50) as p50,
        pct(durationMs, 95) as p95,
        pct(durationMs, 99) as p99
  by route
| sort p95 desc
```

Errors per route:

```
filter event = "http.request" and status >= 500
| stats count() as errors by route, status
| sort errors desc
```

Where slow requests spend their time:

```
filter event = "http.request" and durationMs > 1000
| stats avg(durationMs) as total, avg(dbMs) as db, avg(igdbMs) as igdb,
        avg(dbQueries) as queries
  by route
```

Cold starts:

```
filter event = "http.request"
| stats count() as requests, pct(durationMs, 95) as p95 by coldStart
```

Core Web Vitals, at the 75th percentile (the standard Google uses):

```
filter event = "web.vital"
| stats pct(value, 75) as p75, count() as samples by name, route, device
| sort name, p75 desc
```

Good targets at p75: LCP under 2500 ms, INP under 200 ms, CLS under 0.1.

## Not yet

- **Dashboard and alarms** in SST: a CloudWatch dashboard (3 are free) and a
  few alarms (10 are free), for when there's production traffic.
- **Tracing** with OpenTelemetry and X-Ray, if a slow request can't be
  explained from these logs.
