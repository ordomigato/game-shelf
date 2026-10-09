/**
 * Splits a platform list for display: the first `max` names, and how many
 * more there are (shown as a "+N" pill).
 */
export function summarizePlatforms(
  platforms: string[],
  max = 3,
): { shown: string[]; hiddenCount: number } {
  return {
    shown: platforms.slice(0, max),
    hiddenCount: Math.max(platforms.length - max, 0),
  }
}
