import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { BiographyProfile } from './types'

export const biographyQueryKeys = {
  profile: ['biography', 'profile'] as const,
}

export function useBiographyProfile(): UseQueryResult<BiographyProfile | null> {
  return useQuery({
    queryKey: biographyQueryKeys.profile,
    queryFn: async (): Promise<BiographyProfile | null> => {
      const supabase = createSupabaseBrowserClient()

      const { data, error } = await supabase
        .from('biography_profiles')
        .select('*')
        .is('deleted_at', null)
        .maybeSingle()

      if (error) {
        throw new Error(error.message)
      }

      return data as BiographyProfile | null
    },
  })
}
