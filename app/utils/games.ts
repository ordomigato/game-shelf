/**
 * Joins platform names with " · ", showing at most `max` and summarising the
 * rest as "+N". Returns an empty string for no platforms.
 */
export function formatPlatforms(platforms: string[], max = 3): string {
  if (platforms.length <= max) return platforms.join(' · ')
  const shown = platforms.slice(0, max).join(' · ')
  return `${shown} +${platforms.length - max}`
}
