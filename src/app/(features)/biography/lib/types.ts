// Types for the biography feature.
// These mirror the biography_profiles database table exactly.

export interface BiographyProfile {
  biography_profile_id:  string
  customer_id:           string
  user_id:               string
  source_type:           'profile_url' | 'pasted_text'
  source_url:            string | null
  source_text:           string | null
  subject_name:          string | null
  personal_overview:     string | null
  origin_story:          string | null
  career_journey:        string | null
  current_focus:         string | null
  areas_of_expertise:    string | null
  notable_achievements:  string | null
  career_highlights:     string | null
  personal_interests:    string | null
  biography_job_id:      string | null
  created_at:            string
  updated_at:            string | null
  created_by:            string | null
  updated_by:            string | null
  deleted_at:            string | null
  deleted_by:            string | null
}

// The 8 editable narrative sections (excludes subject_name which uses a plain Input)
export const BIOGRAPHY_SECTION_KEYS = [
  'personal_overview',
  'origin_story',
  'career_journey',
  'current_focus',
  'areas_of_expertise',
  'notable_achievements',
  'career_highlights',
  'personal_interests',
] as const

export type BiographySectionKey = (typeof BIOGRAPHY_SECTION_KEYS)[number]

// Human-readable metadata for each section — used by the page and cards
export interface SectionMeta {
  key:         BiographySectionKey
  label:       string
  description: string
}

export const BIOGRAPHY_SECTIONS: SectionMeta[] = [
  {
    key:         'personal_overview',
    label:       'Personal Overview',
    description: 'A concise narrative summary of the individual and their professional identity.',
  },
  {
    key:         'origin_story',
    label:       'Origin Story',
    description: 'Formative experiences, education, and the motivations that shaped their career path.',
  },
  {
    key:         'career_journey',
    label:       'Career Journey',
    description: 'Chronological narrative of professional development, roles, and major transitions.',
  },
  {
    key:         'current_focus',
    label:       'Current Focus',
    description: 'Current work, priorities, and near-term professional initiatives.',
  },
  {
    key:         'areas_of_expertise',
    label:       'Areas of Expertise',
    description: 'Domains of deep knowledge and authority.',
  },
  {
    key:         'notable_achievements',
    label:       'Notable Achievements',
    description: 'Major accomplishments organised by significance.',
  },
  {
    key:         'career_highlights',
    label:       'Career Highlights',
    description: 'Concise, scannable list of headline milestones.',
  },
  {
    key:         'personal_interests',
    label:       'Personal Interests',
    description: 'Publicly shared hobbies and interests outside work.',
  },
]

// Form value shape used by react-hook-form on the biography page
export interface BiographyFormValues {
  subject_name:         string
  personal_overview:    string
  origin_story:         string
  career_journey:       string
  current_focus:        string
  areas_of_expertise:   string
  notable_achievements: string
  career_highlights:    string
  personal_interests:   string
}

// Empty defaults used when the form is first mounted
export const BIOGRAPHY_FORM_DEFAULTS: BiographyFormValues = {
  subject_name:         '',
  personal_overview:    '',
  origin_story:         '',
  career_journey:       '',
  current_focus:        '',
  areas_of_expertise:   '',
  notable_achievements: '',
  career_highlights:    '',
  personal_interests:   '',
}

// Maps a biography profile to form values
export function profileToFormValues(profile: BiographyProfile): BiographyFormValues {
  return {
    subject_name:         profile.subject_name         ?? '',
    personal_overview:    profile.personal_overview    ?? '',
    origin_story:         profile.origin_story         ?? '',
    career_journey:       profile.career_journey       ?? '',
    current_focus:        profile.current_focus        ?? '',
    areas_of_expertise:   profile.areas_of_expertise   ?? '',
    notable_achievements: profile.notable_achievements ?? '',
    career_highlights:    profile.career_highlights    ?? '',
    personal_interests:   profile.personal_interests   ?? '',
  }
}
