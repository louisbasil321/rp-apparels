import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import { BotIdClient } from 'botid/client';
import LegacyCSSSupport from '@/components/LegacySupport'

import './globals.css'

const inter = Inter({ subsets: ['latin'] })
const protectedRoutes = [
  { path: '/*', method: 'POST' }, // covers every page in the app
];

export const metadata: Metadata = {
  title: 'RP Apparels',
  description: 'Premium fashion for the modern individual',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    
    <html lang="en" suppressHydrationWarning>
      <head>
         <BotIdClient protect={protectedRoutes} />
      </head>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
       
      </body>
      <LegacyCSSSupport />
    </html>
  )
}