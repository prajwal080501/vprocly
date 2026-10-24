import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import { MotionProvider } from '@/components/motion-provider';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'vProcly',
    template: '%s | vProcly',
  },
  description: 'Procurement, finance control and ExceptionOS',
  icons: {
    icon: '/brand-mark.svg',
    shortcut: '/brand-mark.svg',
    apple: '/brand-mark.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="font-sans" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <MotionProvider>{children}</MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
