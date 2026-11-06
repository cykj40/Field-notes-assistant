'use client';

import dynamic from 'next/dynamic';
import { ReactNode } from 'react';
import { FlashToast } from '@/components/FlashToast';

const UpdateBanner = dynamic(
  () => import('@/components/UpdateBanner').then((mod) => ({ default: mod.UpdateBanner })),
  { ssr: false }
);

const SyncIndicator = dynamic(
  () => import('@/components/SyncIndicator').then((mod) => ({ default: mod.SyncIndicator })),
  { ssr: false }
);

interface ClientLayoutProps {
  children: ReactNode;
}

export function ClientLayout({ children }: ClientLayoutProps) {
  return (
    <>
      {children}
      <SyncIndicator />
      <UpdateBanner />
      <FlashToast />
    </>
  );
}
