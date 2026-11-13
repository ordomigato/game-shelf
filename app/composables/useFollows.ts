import type {
  BlockedAccount,
  FollowPage,
  FollowUpdates,
} from '#shared/types/follows'

/**
 * Following, followers and blocks. Reads of an account's lists
 * send the access token when signed in, so the owner sees their own and
 * everyone else sees what the account shows.
 */
export function useFollows() {
  const auth = useAuth()

  async function viewerFetch<T>(
    url: string,
    query?: Record<string, string | undefined>,
  ): Promise<T> {
    await auth.ensureLoaded()
    return auth.status.value === 'signedIn'
      ? auth.apiFetch<T>(url, { query })
      : ($fetch<T>(url, { query }) as Promise<T>)
  }

  const userPath = (username: string) =>
    `/api/u/${encodeURIComponent(username)}`
  const named = (base: string, username: string) =>
    `${base}/${encodeURIComponent(username)}`

  return {
    /** One page of an account's Following or Followers list. */
    page: (
      username: string,
      kind: 'following' | 'followers',
      cursor?: string | null,
    ) =>
      viewerFetch<FollowPage>(`${userPath(username)}/${kind}`, {
        cursor: cursor ?? undefined,
      }),

    follow: (username: string) =>
      auth.apiFetch(named('/api/follows', username), { method: 'PUT' }),

    unfollow: (username: string) =>
      auth.apiFetch(named('/api/follows', username), { method: 'DELETE' }),

    removeFollower: (username: string) =>
      auth.apiFetch(named('/api/followers', username), { method: 'DELETE' }),

    block: (username: string) =>
      auth.apiFetch(named('/api/blocks', username), { method: 'PUT' }),

    unblock: (username: string) =>
      auth.apiFetch(named('/api/blocks', username), { method: 'DELETE' }),

    blocked: () => auth.apiFetch<BlockedAccount[]>('/api/blocks'),

    /** The home page's changes from accounts the viewer follows. */
    updates: () => auth.apiFetch<FollowUpdates>('/api/me/following/updates'),

    /** Clears the "new followers" dot, here and on the server. */
    async markFollowersSeen() {
      await auth.apiFetch('/api/me/followers-seen', { method: 'PUT' })
      if (auth.me.value) auth.me.value = { ...auth.me.value, newFollowers: 0 }
    },
  }
}
