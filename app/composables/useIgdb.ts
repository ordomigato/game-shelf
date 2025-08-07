export async function fetchIgdbGames(query: string) {
  const result = await $fetch<any[]>('/.netlify/functions/fetch-games', {
    method: 'POST',
    body: query,
  })

  return result
}
