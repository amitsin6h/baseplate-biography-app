'use client'

// =============================================================================
// GenerateBiographyModal
// =============================================================================
// Joy Modal + ModalDialog with two tabs:
//   Tab 1 — Profile URL  (calls biography-fetch-profile-from-url)
//   Tab 2 — Paste Text   (calls biography-generate-profile-from-text)
//
// Scrolling contract (ui.md "Scrolling and textareas in modals"):
//   ModalDialog  → overflow: 'hidden'   (no competing scroll)
//   Inner region → overflowY: 'auto'   (single scroll owner)
//   Textarea     → its own internal scroll after minRows height is exceeded
//
// The modal closes as soon as the user submits; the parent page shows its
// own loading state (mutation isPending) while the edge function runs.
// =============================================================================

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  Modal,
  ModalClose,
  ModalDialog,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Textarea,
  Typography,
} from '@mui/joy'
import { Link as LinkIcon, TextAa } from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  useGenerateBiographyFromText,
  useGenerateBiographyFromUrl,
} from '@/app/(features)/biography/lib/mutations'

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------
const urlTabSchema = z.object({
  profile_url: z
    .string()
    .min(1, 'Profile URL is required.')
    .url('Please enter a valid URL including https://.'),
})

const textTabSchema = z.object({
  source_text: z
    .string()
    .min(1, 'Please paste some biography or resume text.')
    .max(100_000, 'Text must be 100 000 characters or fewer.'),
})

type UrlTabValues  = z.infer<typeof urlTabSchema>
type TextTabValues = z.infer<typeof textTabSchema>

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface GenerateBiographyModalProps {
  open:    boolean
  onClose: () => void
  onGenerationStart?: (mode: 'url' | 'text') => void
  onGenerationEnd?:   () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function GenerateBiographyModal({
  open,
  onClose,
  onGenerationStart,
  onGenerationEnd,
}: GenerateBiographyModalProps) {
  const generateFromUrl  = useGenerateBiographyFromUrl()
  const generateFromText = useGenerateBiographyFromText()

  const urlForm = useForm<UrlTabValues>({
    resolver: zodResolver(urlTabSchema),
    defaultValues: { profile_url: '' },
  })

  const textForm = useForm<TextTabValues>({
    resolver: zodResolver(textTabSchema),
    defaultValues: { source_text: '' },
  })

  // Reset forms when the modal is closed so stale input doesn't persist
  useEffect(() => {
    if (!open) {
      urlForm.reset()
      textForm.reset()
    }
  }, [open, urlForm, textForm])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const handleUrlSubmit = urlForm.handleSubmit(async (values) => {
    onClose() // Close immediately; parent shows loading state
    onGenerationStart?.('url')
    generateFromUrl.mutate(
      { profile_url: values.profile_url },
      {
        onSuccess: () => toast.success('Biography generated from URL.'),
        onError:   (err) => toast.error(err.message ?? 'Failed to generate biography from URL.'),
        onSettled: () => onGenerationEnd?.(),
      }
    )
  })

  const handleTextSubmit = textForm.handleSubmit(async (values) => {
    onClose() // Close immediately; parent shows loading state
    onGenerationStart?.('text')
    generateFromText.mutate(
      { source_text: values.source_text },
      {
        onSuccess: () => toast.success('Biography generated from text.'),
        onError:   (err) => toast.error(err.message ?? 'Failed to generate biography from text.'),
        onSettled: () => onGenerationEnd?.(),
      }
    )
  })

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        layout="center"
        sx={{
          width:    { xs: '92vw', sm: '60vw' },
          maxWidth: 720,
          minWidth: 0,
          // Single scroll owner — ModalDialog itself does NOT scroll
          overflow: 'hidden',
          display:  'flex',
          flexDirection: 'column',
          p: 0,
        }}
      >
        {/* -----------------------------------------------------------------
            Header
            ----------------------------------------------------------------- */}
        <Box sx={{ px: 3, pt: 2.5, pb: 1.5 }}>
          <Typography level="h4" sx={{ mb: 0.5 }}>
            Generate Biography
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
            Create your biography from a profile URL or pasted text.
          </Typography>
          <ModalClose />
        </Box>

        <Divider />

        {/* -----------------------------------------------------------------
            Tabs + scrolling inner region
            ----------------------------------------------------------------- */}
        <Tabs defaultValue="url" sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <TabList sx={{ px: 3, pt: 1 }}>
            <Tab value="url">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <LinkIcon size={16} />
                Profile URL
              </Box>
            </Tab>
            <Tab value="text">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <TextAa size={16} />
                Paste Text
              </Box>
            </Tab>
          </TabList>

          {/* ----------------------------------------------------------------
              Profile URL tab
              ---------------------------------------------------------------- */}
          <TabPanel value="url" sx={{ p: 3 }}>
            <Box
              component="form"
              onSubmit={handleUrlSubmit}
              noValidate
              sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
            >
              <FormControl error={!!urlForm.formState.errors.profile_url}>
                <FormLabel>Profile URL</FormLabel>
                <Input
                  {...urlForm.register('profile_url')}
                  type="url"
                  placeholder="https://linkedin.com/in/yourprofile"
                  startDecorator={<LinkIcon size={16} />}
                  autoFocus
                />
                {urlForm.formState.errors.profile_url && (
                  <FormHelperText>
                    {urlForm.formState.errors.profile_url.message}
                  </FormHelperText>
                )}
                <FormHelperText sx={{ color: 'text.tertiary' }}>
                  Enter any public profile URL — LinkedIn, personal website, biography page, etc
                </FormHelperText>
              </FormControl>

              <Box
                sx={{
                  display:        'flex',
                  gap:            1.5,
                  justifyContent: 'flex-end',
                  flexWrap:       'wrap',
                }}
              >
                <Button
                  type="button"
                  variant="outlined"
                  color="neutral"
                  onClick={onClose}
                  sx={{ borderRadius: '999px', flex: { xs: 1, sm: 'none' } }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="solid"
                  color="primary"
                  loading={generateFromUrl.isPending}
                  startDecorator={generateFromUrl.isPending ? <CircularProgress size="sm" /> : undefined}
                  sx={{ borderRadius: '999px', flex: { xs: 1, sm: 'none' } }}
                >
                  Generate
                </Button>
              </Box>
            </Box>
          </TabPanel>

          {/* ----------------------------------------------------------------
              Paste Text tab
              ----------------------------------------------------------------
              The inner region scrolls — not the ModalDialog and not the Textarea
              independently (avoids competing scroll containers per ui.md).
              ---------------------------------------------------------------- */}
          <TabPanel
            value="text"
            sx={{
              p:          3,
              flex:       1,
              // This panel is the single scroll owner for long text content
              overflowY:  'auto',
              minHeight:  0,
            }}
          >
            <Box
              component="form"
              onSubmit={handleTextSubmit}
              noValidate
              sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
            >
              <FormControl error={!!textForm.formState.errors.source_text}>
                <FormLabel>Biography or Resume Text</FormLabel>
                {/*
                  minRows=10 sets the initial visible height to ~10 lines.
                  The Textarea grows as the user types beyond that height but
                  does NOT have its own scrollbar — the panel above scrolls instead.
                  maxLength enforces the 100 000-character limit at the input layer.
                */}
                <Textarea
                  {...textForm.register('source_text')}
                  placeholder="Paste your resume, LinkedIn summary, short bio, or any biographical narrative here…"
                  minRows={6}
                  sx={{ fontFamily: 'body', fontSize: 'sm' }}
                  slotProps={{
                    textarea: { maxLength: 100_000 },
                  }}
                />
                {textForm.formState.errors.source_text && (
                  <FormHelperText>
                    {textForm.formState.errors.source_text.message}
                  </FormHelperText>
                )}
                <FormHelperText sx={{ color: 'text.tertiary' }}>
                  Accepts resume text, a short bio, LinkedIn summary, or any narrative. Maximum 100 000 characters.
                </FormHelperText>
              </FormControl>

              <Box
                sx={{
                  display: 'flex',
                  gap:     1.5,
                  justifyContent: 'flex-end',
                  flexWrap: 'wrap',
                }}
              >
                <Button
                  type="button"
                  variant="outlined"
                  color="neutral"
                  onClick={onClose}
                  sx={{ borderRadius: '999px', flex: { xs: 1, sm: 'none' } }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="solid"
                  color="primary"
                  loading={generateFromText.isPending}
                  startDecorator={
                    generateFromText.isPending ? <CircularProgress size="sm" /> : undefined
                  }
                  sx={{ borderRadius: '999px', flex: { xs: 1, sm: 'none' } }}
                >
                  Generate
                </Button>
              </Box>
            </Box>
          </TabPanel>
        </Tabs>
      </ModalDialog>
    </Modal>
  )
}
