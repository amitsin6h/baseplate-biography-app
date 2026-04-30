// biography-fetch-profile-from-url
// ---------------------------------------------------------------------------
// Accepts:  { profile_url: string }
// Requires: Authorization header with a valid Supabase JWT
//
// Flow:
//   1. Validate and sanitise profile_url (SSRF prevention).
//   2. Call Diffbot Enhance API to enrich the person record.
//   3. Convert Diffbot entity data to normalised source_text.
//   4. Upsert biography_profiles (source_type='profile_url').
//   5. Inline-call the OpenAI biography generation logic.
//   6. Return the fully generated biography_profiles row.
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
// Re-use the same biography generation prompt defined in the sibling function
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
- personal_overview: 2–4 paragraph narrative summary. Professional but accessible tone.
- origin_story: Early life, education, pivotal career moments, the "why" behind their path.
- career_journey: Chronological narrative with roles, companies, milestones, and approximate dates.
- current_focus: Present role, company, projects, and near-term goals.
- areas_of_expertise: Domains of demonstrated deep knowledge (industries, technologies, disciplines).
- notable_achievements: Major accomplishments by significance. Be specific.
- career_highlights: Concise scannable headline milestones (speaker-intro style).
- personal_interests: Publicly shared interests outside work only.

If a field cannot be inferred from the source material, return an empty string.`

// ---------------------------------------------------------------------------
// Converts a Diffbot person entity response into structured prose for the LLM
// Works with both Enhance API (dates as strings) and KG API (dates as objects)
// ---------------------------------------------------------------------------

// Diffbot KG dates are { str: "d2014-02-04", precision: 3, timestamp: ... }
// Enhance API dates are plain strings like "2014" or "Feb 2014"
function extractDateStr(raw: unknown): string {
  if (!raw) return ''
  if (typeof raw === 'string') return raw
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>
    if (typeof obj.str === 'string') {
      // Strip leading "d" and return the year portion only (e.g. "d2014-02-04" → "2014")
      const match = obj.str.replace(/^d/, '').match(/^(\d{4})/)
      return match ? match[1] : ''
    }
  }
  return ''
}
function diffbotEntityToText(entity: Record<string, unknown>): string {
  const lines: string[] = []

  if (entity.name) lines.push(`Name: ${entity.name}`)
  if (entity.description) lines.push(`\nBiography:\n${entity.description}`)

  const employments = entity.employments as Array<Record<string, unknown>> | undefined
  if (Array.isArray(employments) && employments.length > 0) {
    lines.push('\nEmployment History:')
    for (const job of employments) {
      const title = job.title ?? 'Unknown title'
      const employer = (job.employer as Record<string, unknown> | undefined)?.name ?? 'Unknown employer'
      const from = extractDateStr(job.from)
      const to = job.isCurrent ? 'present' : extractDateStr(job.to)
      const dateRange = from || to ? ` (${[from, to].filter(Boolean).join(' – ')})` : ''
      lines.push(`  - ${title} at ${employer}${dateRange}`)
    }
  }

  const educations = entity.educations as Array<Record<string, unknown>> | undefined
  if (Array.isArray(educations) && educations.length > 0) {
    lines.push('\nEducation:')
    for (const edu of educations) {
      const inst = (edu.institution as Record<string, unknown> | undefined)?.name ?? 'Unknown institution'
      const degree = edu.degree
        ? ` — ${(edu.degree as Record<string, unknown>)?.name ?? edu.degree}`
        : ''
      const major = edu.major && typeof edu.major === 'string' ? ` in ${edu.major}` : ''
      lines.push(`  - ${inst}${degree}${major}`)
    }
  }

  const skills = entity.skills as Array<Record<string, unknown>> | undefined
  if (Array.isArray(skills) && skills.length > 0) {
    const skillNames = skills
      .map((s) => s.name as string)
      .filter(Boolean)
      .join(', ')
    lines.push(`\nSkills: ${skillNames}`)
  }

  const achievements = entity.achievements as string[] | undefined
  if (Array.isArray(achievements) && achievements.length > 0) {
    lines.push('\nAchievements:')
    achievements.forEach((a) => lines.push(`  - ${a}`))
  }

  const interests = entity.interests as Array<Record<string, unknown>> | undefined
  if (Array.isArray(interests) && interests.length > 0) {
    const names = interests.map((i) => i.name as string).filter(Boolean).join(', ')
    lines.push(`\nInterests: ${names}`)
  }

  const locations = entity.locations as Array<Record<string, unknown>> | undefined
  if (Array.isArray(locations) && locations.length > 0) {
    const locationNames = locations.map((l) => l.name as string).filter(Boolean)
    if (locationNames.length > 0) {
      lines.push(`\nLocations: ${locationNames.join(', ')}`)
    }
  }

  return lines.join('\n').trim()
}

// ---------------------------------------------------------------------------
// URL validation — prevents SSRF attacks
// ---------------------------------------------------------------------------
function validateProfileUrl(raw: string): { valid: true; url: URL } | { valid: false; reason: string } {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return { valid: false, reason: 'The URL is not valid. Please enter a complete URL including https://.' }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, reason: 'Only HTTP and HTTPS URLs are permitted.' }
  }

  // Block internal / loopback addresses (SSRF prevention)
  const blocked = ['localhost', '127.0.0.1', '0.0.0.0', '::1']
  if (
    blocked.includes(parsed.hostname) ||
    parsed.hostname.endsWith('.local') ||
    parsed.hostname.endsWith('.internal') ||
    /^10\.\d+\.\d+\.\d+$/.test(parsed.hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(parsed.hostname) ||
    /^192\.168\.\d+\.\d+$/.test(parsed.hostname)
  ) {
    return { valid: false, reason: 'Internal and private network URLs are not permitted.' }
  }

  return { valid: true, url: parsed }
}

// ---------------------------------------------------------------------------
// Resolve and validate required environment variables at startup
// ---------------------------------------------------------------------------
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')      ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const OPENAI_API_KEY    = Deno.env.get('OPENAI_API_KEY')    ?? ''
const DIFFBOT_API_KEY   = Deno.env.get('DIFFBOT_API_KEY')   ?? ''

if (!SUPABASE_URL)      throw new Error('SUPABASE_URL is not set')
if (!SUPABASE_ANON_KEY) throw new Error('SUPABASE_ANON_KEY is not set')
if (!OPENAI_API_KEY)    throw new Error('OPENAI_API_KEY is not set')
if (!DIFFBOT_API_KEY)   throw new Error('DIFFBOT_API_KEY is not set')

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
    if (!body || typeof body.profile_url !== 'string' || !body.profile_url.trim()) {
      return errorResponse('profile_url is required', 400)
    }

    const urlValidation = validateProfileUrl(body.profile_url.trim())
    if (!urlValidation.valid) {
      return errorResponse(urlValidation.reason, 400)
    }

    const profileUrl = urlValidation.url.toString()

    // -----------------------------------------------------------------------
    // Supabase client — uses caller's JWT for RLS enforcement
    // -----------------------------------------------------------------------
    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: authHeader } } }
    )

    // Resolve the authenticated user's ID via Supabase Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse('Unable to resolve user identity. Please sign in again.', 401)
    }
    const authUserId = user.id
    const standaloneCustomerId = '00000000-0000-0000-0000-000000000000'

    // -----------------------------------------------------------------------
    // Call Diffbot API
    // LinkedIn blocks real-time scraping — use the Knowledge Graph API for
    // linkedin.com URLs (pre-indexed data). For all other URLs use the
    // Enhance API (live scrape).
    // -----------------------------------------------------------------------
    const isLinkedIn = /linkedin\.com/i.test(new URL(profileUrl).hostname)

    let entity: Record<string, unknown> = {}

    if (isLinkedIn) {
      // Strategy 1: Knowledge Graph v3 — queries pre-indexed person data by LinkedIn URL
      const kgUrl = `https://kg.diffbot.com/kg/v3/enhance?token=${encodeURIComponent(DIFFBOT_API_KEY)}&type=Person&url=${encodeURIComponent(profileUrl)}`
      const kgResponse = await fetch(kgUrl, { headers: { Accept: 'application/json' } })

      if (kgResponse.ok) {
        const kgData = await kgResponse.json()
        const kgEntities: Array<{ entity?: Record<string, unknown> }> = kgData?.data ?? []
        entity = kgEntities[0]?.entity ?? {}
      }

      // Strategy 2: Enhance API with dedicated linkedInUrl parameter (for profiles not in KG index)
      if (Object.keys(entity).length === 0) {
        const enhanceLinkedInUrl = `https://enhance.diffbot.com/enhance?token=${encodeURIComponent(DIFFBOT_API_KEY)}&linkedInUrl=${encodeURIComponent(profileUrl)}`
        const enhanceLinkedInResponse = await fetch(enhanceLinkedInUrl, { headers: { Accept: 'application/json' } })

        if (enhanceLinkedInResponse.ok) {
          const enhanceData = await enhanceLinkedInResponse.json()
          const entities: Array<Record<string, unknown>> = enhanceData?.data ?? []
          entity = entities[0] ?? {}
        }
      }

      // Strategy 3: Fetch the LinkedIn page directly and extract any visible text for LLM parsing
      if (Object.keys(entity).length === 0) {
        try {
          const pageResponse = await fetch(profileUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
              'Accept': 'text/html,application/xhtml+xml',
              'Accept-Language': 'en-US,en;q=0.9',
            },
            redirect: 'follow',
          })
          if (pageResponse.ok) {
            const html = await pageResponse.text()
            // Extract JSON-LD structured data which LinkedIn includes for public profiles
            const jsonLdMatches = html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)
            const structuredTexts: string[] = []
            for (const match of jsonLdMatches) {
              try {
                const parsed = JSON.parse(match[1])
                structuredTexts.push(JSON.stringify(parsed))
              } catch { /* skip malformed */ }
            }
            // Extract meta/og tags
            const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)?.[1] ?? ''
            const ogDescription = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i)?.[1] ?? ''
            const metaDescription = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i)?.[1] ?? ''

            // Build raw text from whatever we extracted
            const rawText = [
              ogTitle && `Name/Title: ${ogTitle}`,
              ogDescription && `Description: ${ogDescription}`,
              !ogDescription && metaDescription && `Description: ${metaDescription}`,
              ...structuredTexts,
            ].filter(Boolean).join('\n\n')

            if (rawText.length > 50) {
              // Use a synthetic entity so the LLM can generate a biography from scraped content
              entity = { name: ogTitle || '', description: rawText }
            }
          }
        } catch { /* network error — fall through to empty entity error */ }
      }
      // If all strategies fail, entity stays {} and we return the empty-data error below
    } else {
      // Enhance API — live page scrape for non-LinkedIn URLs
      const enhanceUrl = `https://enhance.diffbot.com/enhance?token=${encodeURIComponent(DIFFBOT_API_KEY)}&url=${encodeURIComponent(profileUrl)}`

      const enhanceResponse = await fetch(enhanceUrl, { headers: { Accept: 'application/json' } })

      if (!enhanceResponse.ok) {
        if (enhanceResponse.status === 404) {
          return errorResponse(
            'No profile data was found at that URL. Try pasting the biography text instead.',
            404
          )
        }
        return errorResponse(
          `Unable to retrieve profile data from that URL (Diffbot error ${enhanceResponse.status}). Try pasting the biography text instead.`,
          502
        )
      }

      const enhanceData = await enhanceResponse.json()
      // Enhance API response shape: { data: [entity, ...] }
      const entities: Array<Record<string, unknown>> = enhanceData?.data ?? []
      entity = entities[0] ?? {}
    }

    if (Object.keys(entity).length === 0) {
      const isLI = isLinkedIn
      return errorResponse(
        isLI
          ? 'This LinkedIn profile is not publicly indexed. LinkedIn blocks live scraping — only well-known public profiles (executives, public figures) are available via URL. Please use the "Paste Text" tab: open your LinkedIn profile, copy the page text, and paste it there.'
          : 'No profile data was found at that URL. The page may be private or unsupported. Try pasting the biography text instead.',
        422
      )
    }

    const sourceText = diffbotEntityToText(entity)

    // -----------------------------------------------------------------------
    // Upsert biography_profiles — create or refresh the user's singleton row
    // On conflict (active row exists for this user) we update it in place;
    // this is safe because generation has not yet run — only source data is stored.
    // -----------------------------------------------------------------------
    const { data: existingProfile } = await supabase
      .from('biography_profiles')
      .select('biography_profile_id')
      .eq('user_id', authUserId)
      .is('deleted_at', null)
      .maybeSingle()

    let biographyProfileId: string

    if (existingProfile?.biography_profile_id) {
      biographyProfileId = existingProfile.biography_profile_id

      const { error: updateErr } = await supabase
        .from('biography_profiles')
        .update({
          source_type: 'profile_url',
          source_url:  profileUrl,
          source_text: sourceText,
        })
        .eq('biography_profile_id', biographyProfileId)

      if (updateErr) {
        console.error('Profile update error:', updateErr)
        return errorResponse('Failed to update profile record. Please try again.', 500)
      }
    } else {
      const { data: newProfile, error: insertErr } = await supabase
        .from('biography_profiles')
        .insert({
          customer_id: standaloneCustomerId,
          user_id:     authUserId,
          source_type: 'profile_url',
          source_url:  profileUrl,
          source_text: sourceText,
        })
        .select('biography_profile_id')
        .single()

      if (insertErr || !newProfile) {
        console.error('Profile insert error:', insertErr)
        return errorResponse('Failed to create profile record. Please try again.', 500)
      }

      biographyProfileId = newProfile.biography_profile_id
    }

    // -----------------------------------------------------------------------
    // Run the same OpenAI generation logic inline
    // (avoids a round-trip HTTP call to the sibling edge function)
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
          content: `Generate a structured biography from the following source material:\n\n${sourceText}`,
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

    const biographyJobId = crypto.randomUUID()

    const { data: finalProfile, error: finalUpdateErr } = await supabase
      .from('biography_profiles')
      .update({
        subject_name:         generated.subject_name         || null,
        personal_overview:    generated.personal_overview    || null,
        origin_story:         generated.origin_story         || null,
        career_journey:       generated.career_journey       || null,
        current_focus:        generated.current_focus        || null,
        areas_of_expertise:   generated.areas_of_expertise   || null,
        notable_achievements: generated.notable_achievements || null,
        career_highlights:    generated.career_highlights    || null,
        personal_interests:   generated.personal_interests   || null,
        biography_job_id:     biographyJobId,
      })
      .eq('biography_profile_id', biographyProfileId)
      .select()
      .single()

    if (finalUpdateErr || !finalProfile) {
      console.error('Final profile update error:', finalUpdateErr)
      return errorResponse('Failed to save generated biography. Please try again.', 500)
    }

    return jsonResponse({ data: finalProfile })
  } catch (err) {
    console.error('Unexpected error in biography-fetch-profile-from-url:', err)
    return errorResponse('Profile fetch failed. Please try again.', 500)
  }
})
