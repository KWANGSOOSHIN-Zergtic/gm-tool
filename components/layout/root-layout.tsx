import { type PropsWithChildren } from 'react';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { Toaster } from '@/components/ui/toaster';

interface IRootLayoutProps extends PropsWithChildren {
  showHeader?: boolean;
  showFooter?: boolean;
}

export function RootLayout({
  children,
  showHeader = true,
  showFooter = true,
}: IRootLayoutProps) {
  return (
    <ThemeProvider>
      <div className="min-h-screen flex flex-col">
        {showHeader && <Header />}
        <main className="flex-1">{children}</main>
        {showFooter && <Footer />}
      </div>
      <Toaster />
    </ThemeProvider>
  );
} 