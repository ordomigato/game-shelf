const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A request path as a route pattern for logs, like `/api/games/:id` or
 * `/u/:username/shelf/:slug`, so requests group by route instead of by
 * each game or person. The query string is always dropped: it can hold
 * search text. `matched` is the API route Nitro matched, when there is one.
 */
export function routeLabel(path: string, matched?: string): string {
  if (matched && !matched.includes('**')) return matched
  const segments = path.split(/[?#]/)[0]!.split('/').filter(Boolean)
  if (segments[0] === 'u' && segments.length >= 2) {
    // /u/<username>[/<section>[/<slug>]]
    const [, , section, slug] = segments
    return ['', 'u', ':username', section, slug && ':slug']
      .filter((part) => part !== undefined)
      .join('/')
  }
  const label = segments
    .map((segment) =>
      /^\d+$/.test(segment) || UUID.test(segment) ? ':id' : segment,
    )
    .join('/')
  return `/${label}`.slice(0, 100)
}
