'use client'

// =============================================================================
// BiographySectionCard
// =============================================================================
// Renders one biography narrative section as a Joy Card (outlined variant).
//
// Layout:
//   ┌─────────────────────────────────────┐
//   │ Section Label          [Rewrite AI] │
//   │ Description (muted body-xs)         │
//   │─────────────────────────────────────│
//   │ Textarea (editable section content) │
//   │─────────────────────────────────────│
//   │ [Rewrite panel — inline, collapsible]│
//   └─────────────────────────────────────┘
//
// Rewrite flow:
//   1. User clicks "Rewrite with AI" → inline instruction Textarea opens.
//   2. User types an instruction and clicks "Rewrite".
//   3. biography-rewrite-section edge function is called.
//   4. On success: the section's DB row is updated, the form field is reset
//      to the new content, and the parent's `onRewriteComplete` callback is
//      called so that "Cancel" (on the parent form) resets to the post-rewrite
//      state rather than the pre-rewrite state.
// =============================================================================

import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  FormControl,
  FormHelperText,
  Stack,
  Textarea,
  Typography,
} from '@mui/joy'
import { Sparkle, X } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useRewriteBiographySection } from '@/app/(features)/biography/lib/mutations'
import type { BiographySectionKey } from '@/app/(features)/biography/lib/types'

// ---------------------------------------------------------------------------
// Rewrite instruction schema — short instruction capped at 2000 chars
// (mirrors the edge function's server-side limit)
// ---------------------------------------------------------------------------
const rewriteSchema = z.object({
  instruction: z
    .string()
    .min(1, 'Please describe how you would like the section rewritten.')
    .max(2000, 'Instruction must be 2000 characters or fewer.'),
})

type RewriteValues = z.infer<typeof rewriteSchema>

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface BiographySectionCardProps {
  sectionKey:         BiographySectionKey
  label:              string
  description:        string
  value:              string
  onChange:           (value: string) => void
  onBlur?:            () => void
  biographyProfileId: string
  onRewriteComplete:  (sectionKey: BiographySectionKey, newContent: string) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function BiographySectionCard({
  sectionKey,
  label,
  description,
  value,
  onChange,
  onBlur,
  biographyProfileId,
  onRewriteComplete,
}: BiographySectionCardProps) {
  const [rewritePanelOpen, setRewritePanelOpen] = useState(false)
  const instructionInputRef = useRef<HTMLTextAreaElement>(null)

  const rewriteMutation = useRewriteBiographySection()

  const rewriteForm = useForm<RewriteValues>({
    resolver: zodResolver(rewriteSchema),
    defaultValues: { instruction: '' },
  })

  // -------------------------------------------------------------------------
  // Open / close rewrite panel
  // -------------------------------------------------------------------------
  const openRewritePanel = () => {
    setRewritePanelOpen(true)
    // Focus the instruction textarea after the panel renders
    setTimeout(() => instructionInputRef.current?.focus(), 50)
  }

  const closeRewritePanel = () => {
    setRewritePanelOpen(false)
    rewriteForm.reset()
  }

  // -------------------------------------------------------------------------
  // Submit rewrite instruction
  // -------------------------------------------------------------------------
  const handleRewriteSubmit = rewriteForm.handleSubmit(async (values) => {
    rewriteMutation.mutate(

      {
        biography_profile_id: biographyProfileId,
        section_key:          sectionKey,
        instruction:          values.instruction,
      },
      {
        onSuccess: (updatedProfile) => {
          const newContent = (updatedProfile[sectionKey] as string | null) ?? ''
          // Update the parent form field and its default value
          onRewriteComplete(sectionKey, newContent)
          closeRewritePanel()
          toast.success(`"${label}" section rewritten.`)
        },
        onError: (err) => {
          toast.error(err.message ?? `Failed to rewrite "${label}".`)
        },
      }
    )
  })

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <Card
      variant="outlined"
      sx={{
        overflow: 'hidden',
        transition: 'border-color 0.15s ease',
        '&:hover': { borderColor: 'neutral.400' },
      }}
    >
      <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
        {/* Header zone */}
        <Box
          sx={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            gap:            1,
            px:             2.5,
            pt:             2,
            pb:             1.5,
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography level="title-sm" sx={{ fontWeight: 'lg', letterSpacing: 0 }}>{label}</Typography>
            <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.25 }}>
              {description}
            </Typography>
          </Box>

          <Button
            size="sm"
            variant="plain"
            color="neutral"
            startDecorator={rewritePanelOpen ? <X size={13} /> : <Sparkle size={13} />}
            onClick={rewritePanelOpen ? closeRewritePanel : openRewritePanel}
            disabled={rewriteMutation.isPending}
            aria-label={`Rewrite ${label} section with AI`}
            sx={{
              flexShrink: 0,
              fontSize:   'xs',
              color:      rewritePanelOpen ? 'text.secondary' : 'primary.600',
              minHeight:  28,
            }}
          >
            {rewritePanelOpen ? 'Close' : 'Rewrite'}
          </Button>
        </Box>

        <Divider />

        {/* Content zone — borderless textarea */}
        <Textarea
          variant="plain"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          minRows={3}
          placeholder={`Add ${label.toLowerCase()} content here…`}
          sx={{
            borderRadius: 0,
            px:           2.5,
            py:           2,
            fontFamily:   'body',
            fontSize:     'sm',
            lineHeight:   1.7,
          }}
          aria-label={label}
        />

        {/* Rewrite panel — inline, collapsible */}
        {rewritePanelOpen && (
          <>
            <Divider />

            <Box sx={{ px: 2.5, py: 2, bgcolor: 'background.level1' }}>
              <Stack spacing={1.5}>
                <Typography level="body-xs" sx={{ color: 'text.secondary', fontWeight: 'md' }}>
                  How would you like this section rewritten?
                </Typography>

                <FormControl error={!!rewriteForm.formState.errors.instruction}>
                  <Textarea
                    {...rewriteForm.register('instruction')}
                    placeholder="e.g. Make it more concise, focus on the last 5 years…"
                    minRows={2}
                    maxRows={6}
                    sx={{ fontFamily: 'body', fontSize: 'sm' }}
                    slotProps={{ textarea: { ref: instructionInputRef, maxLength: 2000 } }}
                  />
                  {rewriteForm.formState.errors.instruction && (
                    <FormHelperText>
                      {rewriteForm.formState.errors.instruction.message}
                    </FormHelperText>
                  )}
                </FormControl>

                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                  <Button
                    type="button"
                    size="sm"
                    variant="plain"
                    color="neutral"
                    onClick={closeRewritePanel}
                    disabled={rewriteMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="solid"
                    color="primary"
                    loading={rewriteMutation.isPending}
                    onClick={() => handleRewriteSubmit()}
                    startDecorator={!rewriteMutation.isPending ? <Sparkle size={14} /> : undefined}
                    aria-label={`Submit rewrite instruction for ${label}`}
                  >
                    Rewrite
                  </Button>
                </Box>
              </Stack>
            </Box>
          </>
        )}
      </CardContent>
    </Card>
  )
}
