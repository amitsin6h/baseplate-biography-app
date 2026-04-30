// biography-generate-profile-from-text
// ---------------------------------------------------------------------------
// Accepts:  { biography_profile_id: string }
// Requires: Authorization header with a valid Supabase JWT
//
// Flow:
//   1. Verify JWT and load the caller's biography profile (RLS enforced).
//   2. Ensure source_text is present on the profile.
//   3. Call OpenAI GPT-4o with a structured biography prompt.
//   4. Persist all generated sections plus a fresh biography_job_id (provenance).
//   5. Return the updated biography_profiles row.
// ---------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import OpenAI from 'https://esm.sh/openai@4'
import {
  corsHeaders,
  handleOptions,
  jsonResponse,
  errorResponse,
} from '../_shared/cors.ts'

// ---------------------------------------------------------------------------
// OpenAI system prompt — defines all 9 biography section fields
// ---------------------------------------------------------------------------
const BIOGRAPHY_SYSTEM_PROMPT = `You are a professional biographer. Given source material about a person, generate a comprehensive structured biography dossier.

Return ONLY a valid JSON object with these exact fields (no extra keys):
{
  "subject_name": string,
  "personal_overview": string,
  "origin_story": string,
  "career_journey": string,
  "current_focus": string,
  "areas_of_expertise": string,
  "notable_achievements": string,
  "career_highlights": string,
  "personal_interests": string
}

Field guidance:
- subject_name: Full name or preferred professional name as commonly used in public contexts.
- personal_overview: 2–4 paragraph narrative summary of who the person is, what they are known for, and the arc of their career. Professional but accessible tone.
- origin_story: Narrative covering early life influences, education, pivotal career moments, and the "why" behind their professional path. Include specific details where available.
- career_journey: Chronological narrative of professional development. Highlight key roles, companies, industries, and milestones. Include dates or approximate timeframes when known.
- current_focus: Current role, company, projects, and near-term goals. Clearly distinguish present from past.
- areas_of_expertise: Domains of deep knowledge or authority (industries, technologies, disciplines). Prioritise demonstrated expertise over casual interests.
- notable_achievements: Major accomplishments organised by significance, not chronology. Be specific (e.g. "Led Series B at Company X" not "Raised funding").
- career_highlights: Concise scannable list of headline milestones—the items that would appear in a speaker introduction.
- personal_interests: Publicly shared hobbies and interests outside work only. Do not speculate about private life.

If a field cannot be inferred from the source material, return an empty string for that field.`

// ---------------------------------------------------------------------------
// Resolve and validate required environment variables at startup
// ---------------------------------------------------------------------------
const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')              ?? ''
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')         ?? ''
const OPENAI_API_KEY            = Deno.env.get('OPENAI_API_KEY')            ?? ''

if (!SUPABASE_URL)       throw new Error('SUPABASE_URL is not set')
if (!SUPABASE_ANON_KEY)  throw new Error('SUPABASE_ANON_KEY is not set')
if (!OPENAI_API_KEY)     throw new Error('OPENAI_API_KEY is not set')

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
    if (!body || typeof body.biography_profile_id !== 'string') {
      return errorResponse('biography_profile_id is required', 400)
    }

    const { biography_profile_id } = body as { biography_profile_id: string }

    // Basic UUID format guard — prevents injection via malformed IDs
    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!UUID_RE.test(biography_profile_id)) {
      return errorResponse('biography_profile_id must be a valid UUID', 400)
    }

    // -----------------------------------------------------------------------
    // Supabase client — uses the caller's JWT so RLS is fully enforced
    // -----------------------------------------------------------------------
    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: authHeader } } }
    )

    // -----------------------------------------------------------------------
    // Load profile — RLS ensures the caller can only read their own row
    // -----------------------------------------------------------------------
    const { data: profile, error: profileError } = await supabase
      .from('biography_profiles')
      .select('*')
      .eq('biography_profile_id', biography_profile_id)
      .is('deleted_at', null)
      .single()

    if (profileError || !profile) {
      return errorResponse('Profile not found or access denied', 404)
    }

    if (!profile.source_text || profile.source_text.trim() === '') {
      return errorResponse(
        'Profile has no source text. Please provide biography text before generating.',
        400
      )
    }

    // -----------------------------------------------------------------------
    // Call OpenAI GPT-4o
    // -----------------------------------------------------------------------
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: BIOGRAPHY_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Generate a structured biography from the following source material:\n\n${profile.source_text}`,
        },
      ],
    })

    const rawContent = completion.choices[0]?.message?.content
    if (!rawContent) {
      return errorResponse('OpenAI returned an empty response. Please try again.', 502)
    }

    let generated: Record<string, string>
    try {
      generated = JSON.parse(rawContent)
    } catch {
      return errorResponse('Failed to parse OpenAI response. Please try again.', 502)
    }

    // -----------------------------------------------------------------------
    // Persist generated sections + fresh provenance job ID
    // -----------------------------------------------------------------------
    const biographyJobId = crypto.randomUUID()

    const { data: updatedProfile, error: updateError } = await supabase
      .from('biography_profiles')
      .update({
        subject_name:        generated.subject_name        || null,
        personal_overview:   generated.personal_overview   || null,
        origin_story:        generated.origin_story        || null,
        career_journey:      generated.career_journey      || null,
        current_focus:       generated.current_focus       || null,
        areas_of_expertise:  generated.areas_of_expertise  || null,
        notable_achievements: generated.notable_achievements || null,
        career_highlights:   generated.career_highlights   || null,
        personal_interests:  generated.personal_interests  || null,
        biography_job_id:    biographyJobId,
        // updated_at and updated_by are set by the DB trigger
      })
      .eq('biography_profile_id', biography_profile_id)
      .select()
      .single()

    if (updateError || !updatedProfile) {
      console.error('DB update error:', updateError)
      return errorResponse('Failed to save generated biography. Please try again.', 500)
    }

    return jsonResponse({ data: updatedProfile })
  } catch (err) {
    console.error('Unexpected error in biography-generate-profile-from-text:', err)
    return errorResponse('Biography generation failed. Please try again.', 500)
  }
})
