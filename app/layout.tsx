import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Analytics } from '@vercel/analytics/next'
import { ClientLayout } from '@/components/ClientLayout'
import { AuthProvider } from '@/contexts/AuthContext'
import { DateFilterProvider } from '@/contexts/DateFilterContext'
import { ThemeProvider } from "@/components/theme-provider"
import './globals.css'

export const metadata: Metadata = {
  title: 'be-visible.ai',
  description: 'AI Brand Monitoring Dashboard',
  generator: 'be-visible.ai',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable}`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <DateFilterProvider>
              <ClientLayout>
                {children}
              </ClientLayout>
            </DateFilterProvider>
          </AuthProvider>
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  )
}
