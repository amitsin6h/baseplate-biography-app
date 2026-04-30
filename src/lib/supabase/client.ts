import { createClient } from '@supabase/supabase-js'

/**
 * Creates a Supabase browser client using the public anon key.
 * RLS policies enforce data access; the anon key is safe to expose.
 * A new client is created per call so auth state is always fresh.
 */
export function createSupabaseBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
