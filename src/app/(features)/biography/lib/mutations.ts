import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { biographyQueryKeys } from './queries'
import type {
  BiographyProfile,
  BiographyFormValues,
  BiographySectionKey,
} from './types'

// ---------------------------------------------------------------------------
// useSaveBiographyProfile
// ---------------------------------------------------------------------------
// Persists user edits to all narrative section fields via a direct Supabase
// UPDATE. RLS ensures the caller can only update their own row.
// ---------------------------------------------------------------------------
interface SaveProfileInput extends BiographyFormValues {
  biography_profile_id: string
}

export function useSaveBiographyProfile(): UseMutationResult<
  BiographyProfile,
  Error,
  SaveProfileInput
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: SaveProfileInput): Promise<BiographyProfile> => {
      const supabase = createSupabaseBrowserClient()
      const { biography_profile_id, ...fields } = input

      // Map empty strings to null so that blank-but-saved fields remain null
      // in the database (consistent with how the LLM returns absent fields).
      const sanitised = Object.fromEntries(
        Object.entries(fields).map(([k, v]) => [k, v === '' ? null : v])
      )

      const { data, error } = await supabase
        .from('biography_profiles')
        .update(sanitised)
        .eq('biography_profile_id', biography_profile_id)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data as BiographyProfile
    },
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(biographyQueryKeys.profile, updatedProfile)
    },
  })
}

// ---------------------------------------------------------------------------
// useGenerateBiographyFromText
// ---------------------------------------------------------------------------
// Upserts the user's biography_profiles row with the provided source_text
// and then invokes the LLM generation edge function.
// Returns the fully generated profile.
// ---------------------------------------------------------------------------
interface GenerateFromTextInput {
  source_text: string
}

export function useGenerateBiographyFromText(): UseMutationResult<
  BiographyProfile,
  Error,
  GenerateFromTextInput
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: GenerateFromTextInput): Promise<BiographyProfile> => {
      const supabase = createSupabaseBrowserClient()

      // Step 1 — Resolve the authenticated user's ID
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) throw new Error('Unable to resolve user identity. Please sign in.')

      const authUserId = user.id
      // customer_id is not used in standalone mode; use a fixed sentinel UUID
      // so the NOT NULL constraint is satisfied. In the full Baseplate platform
      // this would be resolved via the customer_id() helper function.
      const standaloneCustomerId = '00000000-0000-0000-0000-000000000000'

      // Step 2 — Upsert the profile row with the source text
      const { data: existingRow } = await supabase
        .from('biography_profiles')
        .select('biography_profile_id')
        .eq('user_id', authUserId)
        .is('deleted_at', null)
        .maybeSingle()

      let biographyProfileId: string

      if (existingRow?.biography_profile_id) {
        biographyProfileId = existingRow.biography_profile_id

        const { error: updateErr } = await supabase
          .from('biography_profiles')
          .update({ source_type: 'pasted_text', source_url: null, source_text: input.source_text })
          .eq('biography_profile_id', biographyProfileId)

        if (updateErr) throw new Error(updateErr.message)
      } else {
        const { data: newRow, error: insertErr } = await supabase
          .from('biography_profiles')
          .insert({
            customer_id: standaloneCustomerId,
            user_id:     authUserId,
            source_type: 'pasted_text',
            source_text: input.source_text,
          })
          .select('biography_profile_id')
          .single()

        if (insertErr || !newRow) throw new Error(insertErr?.message ?? 'Failed to create profile.')
        biographyProfileId = newRow.biography_profile_id
      }

      // Step 3 — Invoke the LLM generation edge function
      const { data: fnResult, error: fnError } = await supabase.functions.invoke(
        'biography-generate-profile-from-text',
        { body: { biography_profile_id: biographyProfileId } }
      )

      if (fnError) throw new Error(fnError.message)
      if (fnResult?.error) throw new Error(fnResult.error)

      return fnResult.data as BiographyProfile
    },
    onSuccess: (generatedProfile) => {
      queryClient.setQueryData(biographyQueryKeys.profile, generatedProfile)
    },
  })
}

// ---------------------------------------------------------------------------
// useGenerateBiographyFromUrl
// ---------------------------------------------------------------------------
// Calls the Diffbot-backed edge function to fetch and generate a biography
// from a public profile URL.
// ---------------------------------------------------------------------------
interface GenerateFromUrlInput {
  profile_url: string
}

export function useGenerateBiographyFromUrl(): UseMutationResult<
  BiographyProfile,
  Error,
  GenerateFromUrlInput
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: GenerateFromUrlInput): Promise<BiographyProfile> => {
      const supabase = createSupabaseBrowserClient()

      const { data: fnResult, error: fnError } = await supabase.functions.invoke(
        'biography-fetch-profile-from-url',
        { body: { profile_url: input.profile_url } }
      )

      if (fnError) throw new Error(fnError.message)
      if (fnResult?.error) throw new Error(fnResult.error)

      return fnResult.data as BiographyProfile
    },
    onSuccess: (generatedProfile) => {
      queryClient.setQueryData(biographyQueryKeys.profile, generatedProfile)
    },
  })
}

// ---------------------------------------------------------------------------
// useRewriteBiographySection
// ---------------------------------------------------------------------------
// Calls the rewrite edge function to regenerate a single biography section
// based on a user-provided instruction. On success the query cache is updated
// with the server's response so the page reflects the new DB state.
// ---------------------------------------------------------------------------
interface RewriteSectionInput {
  biography_profile_id: string
  section_key:          BiographySectionKey
  instruction:          string
}

export function useRewriteBiographySection(): UseMutationResult<
  BiographyProfile,
  Error,
  RewriteSectionInput
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: RewriteSectionInput): Promise<BiographyProfile> => {
      const supabase = createSupabaseBrowserClient()

      const { data: fnResult, error: fnError } = await supabase.functions.invoke(
        'biography-rewrite-section',
        { body: input }
      )

      if (fnError) throw new Error(fnError.message)
      if (fnResult?.error) throw new Error(fnResult.error)

      return fnResult.data as BiographyProfile
    },
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(biographyQueryKeys.profile, updatedProfile)
    },
  })
}
