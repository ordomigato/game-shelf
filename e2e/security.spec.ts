import { expect, test } from './fixtures'

test('pages send security headers', async ({ request }) => {
  for (const path of ['/', '/explore', '/login']) {
    const headers = (await request.get(path)).headers()
    const csp = headers['content-security-policy']
    expect(csp, path).toContain("default-src 'self'")
    expect(csp, path).toContain('https://images.igdb.com')
    expect(csp, path).toContain("frame-ancestors 'none'")
    expect(headers['strict-transport-security'], path).toContain(
      'max-age=31536000',
    )
    expect(headers['x-content-type-options'], path).toBe('nosniff')
    expect(headers['x-frame-options'], path).toBe('DENY')
    expect(headers['referrer-policy'], path).toBe(
      'strict-origin-when-cross-origin',
    )
  }
})

test('API responses send them too', async ({ request }) => {
  // Error responses get Nitro's own, stricter policy (no scripts at all).
  const headers = (await request.get('/api/games/search?q=x')).headers()
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(headers['strict-transport-security']).toContain('max-age=31536000')
  expect(headers['x-content-type-options']).toBe('nosniff')
})

test('the server does not announce what it runs', async ({ request }) => {
  const headers = (await request.get('/')).headers()
  expect(headers['x-powered-by']).toBeUndefined()
})
