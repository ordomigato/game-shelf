/**
 * Security headers on every response the server sends (pages and API).
 * Built files come from S3 through CloudFront and don't pass through here.
 *
 * The Content-Security-Policy limits where the page may load anything from:
 * this site, IGDB's cover images and Cognito (Amplify signs in from the
 * browser, and finishes a social sign-in at Cognito's own domain). Scripts still allow inline code, because Nuxt inlines the page
 * state and the colour mode sets itself before the page draws; nonces
 * would be the next step.
 *
 * Skipped in development, where Vite's hot reload needs more.
 */
export default defineEventHandler((event) => {
  if (import.meta.dev) return
  const { cognitoUserPoolId: poolId, cognitoDomain } =
    useRuntimeConfig(event).public
  const region = poolId.split('_')[0] || 'us-east-1'
  const cognito = [
    `https://cognito-idp.${region}.amazonaws.com`,
    ...(cognitoDomain ? [`https://${cognitoDomain}`] : []),
  ].join(' ')
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://images.igdb.com",
    "font-src 'self' data:",
    `connect-src 'self' ${cognito}`,
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
  setResponseHeaders(event, {
    'Content-Security-Policy': csp,
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy':
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  })
})
