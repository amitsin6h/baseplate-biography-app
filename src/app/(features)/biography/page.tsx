'use client'

// =============================================================================
// Biography Page — /biography
// =============================================================================
// User Singleton screen. Placed in the user avatar dropdown per ui.md:
//   "User Singleton screens are accessed from the user's personal settings area."
//
// Header:    "Your Biography" (h1) + "Generate and maintain your biography." (subtext)
// Actions:   "Generate" (no profile) or "Update" (profile exists) — right-aligned
// Content:   Loading skeleton → empty state → editable section cards
// Footer:    Save + Cancel (when form is dirty)
// =============================================================================

import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Alert,
  Avatar,
  Box,
  Breadcrumbs,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Input,
  FormControl,
  FormLabel,
  Link,
  Skeleton,
  Stack,
  Typography,
} from '@mui/joy'
import {
  ArrowClockwise,
  FloppyDisk,
  Link as LinkIcon,
  Robot,
  TextAa,
  X,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useBiographyProfile } from './lib/queries'
import { useSaveBiographyProfile } from './lib/mutations'
import {
  BIOGRAPHY_FORM_DEFAULTS,
  BIOGRAPHY_SECTIONS,
  profileToFormValues,
  type BiographyFormValues,
  type BiographySectionKey,
} from './lib/types'
import GenerateBiographyModal from '@/components/biography/GenerateBiographyModal'
import BiographySectionCard from '@/components/biography/BiographySectionCard'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// Zod schema — all fields are optional strings; no blank-line requirements
// in MVP (keep validation lenient per ui.md: "lenient MVP validation")
// ---------------------------------------------------------------------------
const biographyFormSchema = z.object({
  subject_name:         z.string(),
  personal_overview:    z.string(),
  origin_story:         z.string(),
  career_journey:       z.string(),
  current_focus:        z.string(),
  areas_of_expertise:   z.string(),
  notable_achievements: z.string(),
  career_highlights:    z.string(),
  personal_interests:   z.string(),
})

// ---------------------------------------------------------------------------
// Provenance chip — shows how and when the profile was generated
// ---------------------------------------------------------------------------
function ProvenanceChip({
  sourceType,
  biographyJobId,
  updatedAt,
}: {
  sourceType: 'profile_url' | 'pasted_text'
  biographyJobId: string | null
  updatedAt: string | null
}) {
  if (!biographyJobId) return null

  const label = sourceType === 'profile_url' ? 'Generated from URL' : 'Generated from text'
  const icon = sourceType === 'profile_url' ? <LinkIcon size={14} /> : <TextAa size={14} />
  const dateStr = updatedAt
    ? new Date(updatedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null

  return (
    <Chip
      size="sm"
      variant="soft"
      color="neutral"
      startDecorator={icon}
      sx={{ fontWeight: 'normal' }}
    >
      {label}
      {dateStr ? ` · ${dateStr}` : ''}
    </Chip>
  )
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------
function BiographyPageSkeleton() {
  return (
    <Stack spacing={2} sx={{ mt: 3 }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <Box
          key={i}
          sx={{
            border: '1px solid',
            borderColor: 'neutral.outlinedBorder',
            borderRadius: 'sm',
            p: 2,
          }}
        >
          <Skeleton variant="text" width="30%" sx={{ mb: 1 }} />
          <Skeleton variant="rectangular" height={80} />
        </Box>
      ))}
    </Stack>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
function BiographyEmptyState({ onGenerate }: { onGenerate: () => void }) {
  return (
    <Box
      sx={{
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            3,
        py:             10,
        px:             4,
        textAlign:      'center',
        bgcolor:        'background.level1',
        borderRadius:   'lg',
        mt:             4,
      }}
    >
      <Box
        sx={{
          width:          64,
          height:         64,
          borderRadius:   '50%',
          bgcolor:        'background.level2',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
        }}
      >
        <Robot size={28} weight="regular" color="var(--joy-palette-neutral-500)" />
      </Box>
      <Stack spacing={1} sx={{ maxWidth: 380 }}>
        <Typography level="title-lg">No biography yet</Typography>
        <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
          Generate your biography from a public profile URL or by pasting your
          resume or bio text. The AI will structure it into a reusable dossier.
        </Typography>
      </Stack>
      <Button
        variant="solid"
        color="primary"
        size="md"
        startDecorator={<ArrowClockwise size={16} />}
        onClick={onGenerate}
        sx={{ borderRadius: '999px' }}
      >
        Generate Biography
      </Button>
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function BiographyPage() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationMode, setGenerationMode] = useState<'url' | 'text' | null>(null)

  const { data: profile, isLoading, isError, error } = useBiographyProfile()
  const saveMutation = useSaveBiographyProfile()

  const form = useForm<BiographyFormValues>({
    resolver: zodResolver(biographyFormSchema),
    defaultValues: BIOGRAPHY_FORM_DEFAULTS,
  })

  const isDirty = form.formState.isDirty

  // Auto sign-in anonymously so edge functions receive a real user JWT.
  // In the full Baseplate platform this is handled by the host app's auth flow.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        supabase.auth.signInAnonymously().catch(() => {
          // Anonymous auth may not be enabled — silently ignore;
          // the user will see the error from the edge function instead.
        })
      }
    })
  }, [])

  // Populate form whenever the profile arrives or is updated
  useEffect(() => {
    if (profile) {
      form.reset(profileToFormValues(profile))
    }
  }, [profile, form])

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------
  const handleSave = form.handleSubmit(async (values) => {
    if (!profile?.biography_profile_id) return

    saveMutation.mutate(
      { biography_profile_id: profile.biography_profile_id, ...values },
      {
        onSuccess: () => {
          toast.success('Biography saved successfully.')
          form.reset(values) // Mark form as pristine after save
        },
        onError: (err) => {
          toast.error(err.message ?? 'Failed to save biography.')
        },
      }
    )
  })

  const handleCancel = () => {
    if (profile) {
      form.reset(profileToFormValues(profile))
    } else {
      form.reset(BIOGRAPHY_FORM_DEFAULTS)
    }
  }

  // Called by BiographySectionCard after a successful rewrite.
  // Updates both the default value and the current field value for the
  // rewritten section so that "Cancel" resets to the post-rewrite state.
  const handleRewriteComplete = (
    sectionKey: BiographySectionKey,
    newContent: string
  ) => {
    form.resetField(sectionKey, { defaultValue: newContent })
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', px: { xs: 2, sm: 3 }, py: 4 }}>
      {/* ----------------------------------------------------------------
          Standard Page Header (ui.md guidelines)
          Left:  title stack (flex: 1, minWidth: 0)
          Right: action group grid (2-column, marginLeft: auto)
          ---------------------------------------------------------------- */}
      <Box
        sx={{
          display:        'flex',
          flexDirection:  'row',
          justifyContent: 'space-between',
          alignItems:     'flex-start',
          columnGap:      4,
          mb:             3,
        }}
      >
        {/* Left column */}
        <Stack sx={{ flex: 1, minWidth: 0 }}>
          <Typography level="h1">Your Biography</Typography>
          <Breadcrumbs size="sm" sx={{ px: 0, py: 0.5 }}>
            <Link href="/" level="body-sm">Home</Link>
            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Biography</Typography>
          </Breadcrumbs>
          <Typography level="body-md" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Generate and maintain your biography dossier. Start from a profile URL or paste your resume text.
          </Typography>
        </Stack>

        {/* Right column — action grid per ui.md */}
        <Box
          sx={{
            display:         'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap:             1.5,
            marginLeft:      'auto',
            justifyContent:  'flex-end',
            alignItems:      'flex-start',
            flexShrink:      0,
          }}
        >
          <Button
            variant="solid"
            color="primary"
            onClick={() => setIsModalOpen(true)}
            disabled={isLoading || isGenerating}
            sx={{ gridColumn: '2 / 3', borderRadius: '999px' }}
          >
            {profile ? 'Re-generate' : 'Generate'}
          </Button>
        </Box>
      </Box>

      <Divider />

      {/* ----------------------------------------------------------------
          Content area
          ---------------------------------------------------------------- */}

      {/* Loading state */}
      {isLoading && <BiographyPageSkeleton />}

      {/* Generation state */}
      {isGenerating && (
        <Alert
          color="primary"
          variant="soft"
          startDecorator={<CircularProgress size="sm" />}
          sx={{ mt: 3 }}
        >
          {generationMode === 'url'
            ? 'Generating biography from profile URL. This may take a moment.'
            : 'Generating biography from pasted text. This may take a moment.'}
        </Alert>
      )}

      {/* Error state */}
      {isError && (
        <Alert color="danger" sx={{ mt: 3 }}>
          {(error as Error)?.message ?? 'Failed to load biography. Please refresh the page.'}
        </Alert>
      )}

      {/* Empty state */}
      {!isLoading && !isError && !profile && (
        <BiographyEmptyState onGenerate={() => setIsModalOpen(true)} />
      )}

      {/* Profile form */}
      {!isLoading && !isError && profile && (
        <Box component="form" onSubmit={handleSave} noValidate sx={{ mt: 3 }}>
          {/* Profile identity banner — avatar + name + provenance */}
          <Box
            sx={{
              display:      'flex',
              alignItems:   'center',
              gap:          2.5,
              p:            3,
              mb:           3,
              borderRadius: 'lg',
              bgcolor:      'background.level1',
              border:       '1px solid',
              borderColor:  'neutral.outlinedBorder',
            }}
          >
            <Avatar
              size="lg"
              variant="soft"
              color="primary"
              sx={{ width: 64, height: 64, fontSize: '1.5rem', fontWeight: 'lg', flexShrink: 0 }}
            >
              {form.watch('subject_name')
                ? form
                    .watch('subject_name')
                    .trim()
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((w) => w[0]?.toUpperCase() ?? '')
                    .join('')
                : '?'}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography level="title-lg" sx={{ fontWeight: 'lg' }} noWrap>
                {form.watch('subject_name') || 'Your Biography'}
              </Typography>
              <Box sx={{ mt: 0.5 }}>
                <ProvenanceChip
                  sourceType={profile.source_type}
                  biographyJobId={profile.biography_job_id}
                  updatedAt={profile.updated_at}
                />
              </Box>
            </Box>
          </Box>

          {/* Full name — plain Input (not a section card) */}
          <Controller
            name="subject_name"
            control={form.control}
            render={({ field }) => (
              <FormControl sx={{ mb: 3 }}>
                <FormLabel sx={{ fontWeight: 'lg', mb: 0.75 }}>Full Name</FormLabel>
                <Input
                  {...field}
                  placeholder="e.g. Sarah Chen"
                  sx={{ '--Input-radius': '8px' }}
                />
              </FormControl>
            )}
          />

          {/* Narrative section cards */}
          <Stack spacing={2.5}>
            {BIOGRAPHY_SECTIONS.map((section) => (
              <Controller
                key={section.key}
                name={section.key}
                control={form.control}
                render={({ field }) => (
                  <BiographySectionCard
                    sectionKey={section.key}
                    label={section.label}
                    description={section.description}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    biographyProfileId={profile.biography_profile_id}
                    onRewriteComplete={handleRewriteComplete}
                  />
                )}
              />
            ))}
          </Stack>

          {/* Save / Cancel footer — sticky floating bar, only shown when form has unsaved changes */}
          {isDirty && (
            <Box
              sx={{
                position:    'fixed',
                bottom:      24,
                left:        '50%',
                transform:   'translateX(-50%)',
                zIndex:      1200,
                display:     'flex',
                gap:         1.5,
                alignItems:  'center',
                px:          3,
                py:          1.5,
                borderRadius: '999px',
                bgcolor:     'background.surface',
                boxShadow:   'lg',
                border:      '1px solid',
                borderColor: 'neutral.outlinedBorder',
              }}
            >
              <Button
                type="button"
                variant="outlined"
                color="neutral"
                startDecorator={<X size={16} />}
                onClick={handleCancel}
                disabled={saveMutation.isPending}
                sx={{ borderRadius: '999px' }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="solid"
                color="primary"
                startDecorator={!saveMutation.isPending ? <FloppyDisk size={16} /> : undefined}
                loading={saveMutation.isPending}
                sx={{ borderRadius: '999px' }}
              >
                Save Changes
              </Button>
            </Box>
          )}
        </Box>
      )}

      {/* Generate / Update modal */}
      <GenerateBiographyModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onGenerationStart={(mode) => {
          setGenerationMode(mode)
          setIsGenerating(true)
        }}
        onGenerationEnd={() => {
          setIsGenerating(false)
          setGenerationMode(null)
        }}
      />
    </Box>
  )
}
