import type { Metadata, Viewport } from 'next';
import dynamic from 'next/dynamic';
import './globals.css';

const UpdateBanner = dynamic(() => import('@/components/UpdateBanner').then((mod) => ({ default: mod.UpdateBanner })), {
  ssr: false,
});

export const metadata: Metadata = {
  title: 'Field Notes',
  description: 'Mobile field note-taking assistant',
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/hard-hat.svg',
    apple: '/icons/icon-192.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Field Notes',
  },
};

export const viewport: Viewport = {
  themeColor: '#16a34a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        {children}
        <UpdateBanner />
      </body>
    </html>
  );
}
