const STORAGE_KEY = 'user-tokens'

type UserTokensStore = Record<string, string[]>

function load(): UserTokensStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function save(store: UserTokensStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function getUserTokensForChain(chainId: string): string[] {
  return load()[chainId] ?? []
}

export function addUserToken(chainId: string, address: string) {
  const store = load()
  const list = store[chainId] ?? []
  const lower = address.toLowerCase()
  if (!list.includes(lower)) {
    list.push(lower)
    store[chainId] = list
    save(store)
  }
}

export function isUserToken(chainId: string, address: string): boolean {
  const list = load()[chainId]
  return list ? list.includes(address.toLowerCase()) : false
}
