/**
 * Whether a collection can't take a game: it holds as many as the plan
 * allows and the game isn't in it. A game already in a full collection can
 * still be taken out.
 */
export function collectionFullFor(
  collection: { itemCount: number },
  limit: number,
  gameIsIn: boolean,
): boolean {
  return !gameIsIn && collection.itemCount >= limit
}
