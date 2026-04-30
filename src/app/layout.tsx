import type { Metadata } from 'next'
import { CssVarsProvider } from '@mui/joy/styles'
import { Toaster } from 'sonner'
import QueryProvider from '@/providers/QueryProvider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Baseplate Biography',
  description: 'Generate and manage your biography dossier',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <CssVarsProvider>
          <QueryProvider>
            {children}
            <Toaster position="bottom-right" richColors />
          </QueryProvider>
        </CssVarsProvider>
      </body>
    </html>
  )
}
