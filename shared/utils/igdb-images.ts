export type IgdbImageSize =
  | 'cover_small'
  | 'cover_big'
  | 'cover_big_2x'
  | 'screenshot_med'
  | 'screenshot_big'
  | '720p'
  | '1080p'

export function igdbImageUrl(imageId: string, size: IgdbImageSize): string {
  return `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg`
}
