// biography-rewrite-section
// ---------------------------------------------------------------------------
// Accepts:  { biography_profile_id: string, section_key: string, instruction: string }
// Requires: Authorization header with a valid Supabase JWT
//
// Flow:
//   1. Validate section_key against the 9 permitted biography sections.
//   2. Load the biography profile (RLS enforced — caller must own the row).
//   3. Call OpenAI to rewrite only the specified section per the instruction.
//   4. Persist the rewritten section to biography_profiles.
//   5. Return the updated profile row.
// ---------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import OpenAI from 'https://esm.sh/openai@4'
import {
  handleOptions,
  jsonResponse,
  errorResponse,
} from '../_shared/cors.ts'

// ---------------------------------------------------------------------------
// Valid section keys — matches the biography_profiles column names exactly
// ---------------------------------------------------------------------------
const VALID_SECTION_KEYS = [
  'personal_overview',
  'origin_story',
  'career_journey',
  'current_focus',
  'areas_of_expertise',
  'notable_achievements',
  'career_highlights',
  'personal_interests',
] as const

type SectionKey = (typeof VALID_SECTION_KEYS)[number]

// Human-readable labels used in prompts
const SECTION_LABELS: Record<SectionKey, string> = {
  personal_overview:    'Personal Overview',
  origin_story:         'Origin Story',
  career_journey:       'Career Journey',
  current_focus:        'Current Focus',
  areas_of_expertise:   'Areas of Expertise',
  notable_achievements: 'Notable Achievements',
  career_highlights:    'Career Highlights',
  personal_interests:   'Personal Interests',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ---------------------------------------------------------------------------
// Resolve and validate required environment variables at startup
// ---------------------------------------------------------------------------
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')      ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const OPENAI_API_KEY    = Deno.env.get('OPENAI_API_KEY')    ?? ''

if (!SUPABASE_URL)      throw new Error('SUPABASE_URL is not set')
if (!SUPABASE_ANON_KEY) throw new Error('SUPABASE_ANON_KEY is not set')
if (!OPENAI_API_KEY)    throw new Error('OPENAI_API_KEY is not set')

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return handleOptions()

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return errorResponse('Missing authorization header', 401)
  }

  try {
    // -----------------------------------------------------------------------
    // Parse and validate request body
    // -----------------------------------------------------------------------
    const body = await req.json().catch(() => null)
    if (!body) {
      return errorResponse('Request body is required', 400)
    }

    const { biography_profile_id, section_key, instruction } = body as Record<string, unknown>

    if (typeof biography_profile_id !== 'string' || !UUID_RE.test(biography_profile_id)) {
      return errorResponse('biography_profile_id must be a valid UUID', 400)
    }

    if (typeof section_key !== 'string' || !(VALID_SECTION_KEYS as readonly string[]).includes(section_key)) {
      return errorResponse(
        `section_key must be one of: ${VALID_SECTION_KEYS.join(', ')}`,
        400
      )
    }

    if (typeof instruction !== 'string' || instruction.trim().length === 0) {
      return errorResponse('instruction is required', 400)
    }

    // Limit instruction length to prevent abuse
    if (instruction.length > 2000) {
      return errorResponse('instruction must be 2000 characters or fewer', 400)
    }

    const validSectionKey = section_key as SectionKey

    // -----------------------------------------------------------------------
    // Supabase client — uses caller's JWT; RLS enforces ownership
    // -----------------------------------------------------------------------
    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: authHeader } } }
    )

    // -----------------------------------------------------------------------
    // Load profile — will 404 if the caller does not own this row (via RLS)
    // -----------------------------------------------------------------------
    const { data: profile, error: profileError } = await supabase
      .from('biography_profiles')
      .select('biography_profile_id, subject_name, ' + validSectionKey)
      .eq('biography_profile_id', biography_profile_id)
      .is('deleted_at', null)
      .single()

    if (profileError || !profile) {
      return errorResponse('Profile not found or access denied', 404)
    }

    const currentSectionContent = (profile[validSectionKey] as string | null) ?? ''
    const sectionLabel = SECTION_LABELS[validSectionKey]
    const subjectName = (profile.subject_name as string | null) ?? 'this person'

    // -----------------------------------------------------------------------
    // Call OpenAI to rewrite the specific section
    // -----------------------------------------------------------------------
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

    const systemPrompt = `You are a professional biographer editing a biography for ${subjectName}.
You will rewrite a single section of their biography according to the user's instruction.
Return ONLY the rewritten section text — no JSON wrapper, no section header, no commentary.
Keep a professional but accessible tone.`

    const userMessage = `Section: ${sectionLabel}

Current content:
${currentSectionContent || '(no content yet)'}

Instruction: ${instruction.trim()}

Rewrite this section accordingly.`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.4,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    })

    const rewrittenContent = completion.choices[0]?.message?.content?.trim()
    if (!rewrittenContent) {
      return errorResponse('OpenAI returned an empty response. Please try again.', 502)
    }

    // -----------------------------------------------------------------------
    // Persist only the rewritten section column
    // -----------------------------------------------------------------------
    const { data: updatedProfile, error: updateError } = await supabase
      .from('biography_profiles')
      .update({ [validSectionKey]: rewrittenContent })
      .eq('biography_profile_id', biography_profile_id)
      .select()
      .single()

    if (updateError || !updatedProfile) {
      console.error('Section update error:', updateError)
      return errorResponse('Failed to save rewritten section. Please try again.', 500)
    }

    return jsonResponse({ data: updatedProfile })
  } catch (err) {
    console.error('Unexpected error in biography-rewrite-section:', err)
    return errorResponse('Section rewrite failed. Please try again.', 500)
  }
})
