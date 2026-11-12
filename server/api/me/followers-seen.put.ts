/** Marks the signed-in user's followers as seen, which clears the "new" dot. */
export default defineEventHandler(async (event) => {
  const { user } = await authorize(event, 'account.update')
  await markFollowersSeen(user.id)
  setResponseStatus(event, 204)
  return null
})
