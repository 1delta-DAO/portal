const DEFAULT_BASE_URL = 'https://portal.1delta.io'

/** Base backend URL, e.g. https://portal.1delta.io */
export const BACKEND_BASE_URL = (import.meta.env.VITE_BACKEND_BASE_URL as string | undefined) ?? DEFAULT_BASE_URL
