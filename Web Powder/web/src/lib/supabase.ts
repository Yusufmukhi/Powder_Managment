import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY!

// Must match the STORAGE_KEY in src/context/session.context.tsx
const SESSION_STORAGE_KEY = 'pms_session'

function getSessionToken(): string | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.sessionToken || null
  } catch {
    return null
  }
}

// Every request carries the current session token as a header. The
// database's Row Level Security policies read this header to figure out
// which company is making the request - see sql/02_row_level_security.sql.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: (input: RequestInfo | URL, init: RequestInit = {}) => {
      const token = getSessionToken()
      const headers = new Headers(init.headers)
      if (token) headers.set('x-session-token', token)
      return fetch(input, { ...init, headers })
    },
  },
})
