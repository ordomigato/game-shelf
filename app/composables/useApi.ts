import { ofetch, type FetchOptions, type FetchError } from 'ofetch'

type HttpMethod =
  | 'GET' | 'HEAD' | 'PATCH' | 'POST' | 'PUT' | 'DELETE' | 'CONNECT' | 'OPTIONS' | 'TRACE'
  | 'get' | 'head' | 'patch' | 'post' | 'put' | 'delete' | 'connect' | 'options' | 'trace'

type ApiOptions<T> = Omit<FetchOptions<'json'>, 'parseResponse' | 'method'> & {
  method?: HttpMethod
  transform?: (data: any) => T
  retry?: number
  throwOnError?: boolean
}

export function useApi<T = any>(
  url: string | (() => string),
  options: ApiOptions<T> = {}
) {
  const data = ref<T | null>(null)
  const error = ref<FetchError | null>(null)
  const pending = ref(false)

  const retryCount = ref(0)

  const fetchData = async () => {
    pending.value = true
    error.value = null

    const resolvedUrl = typeof url === 'function' ? url() : url

    try {
      const result = await ofetch<T>(resolvedUrl, {
        ...options,
        retry: 0,
        responseType: 'json',
      })

      data.value = options.transform?.(result) ?? result
    } catch (err: any) {
      error.value = err

      if (options.retry && retryCount.value < options.retry) {
        retryCount.value++
        await fetchData()
        return
      }

      if (options.throwOnError) throw err
    } finally {
      pending.value = false
    }
  }

  onMounted(fetchData)

  return {
    data,
    error,
    pending,
    refresh: fetchData,
  }
}
