'use client';

import dynamic from 'next/dynamic';
import { ReactNode } from 'react';

const UpdateBanner = dynamic(
  () => import('@/components/UpdateBanner').then((mod) => ({ default: mod.UpdateBanner })),
  { ssr: false }
);

interface ClientLayoutProps {
  children: ReactNode;
}

export function ClientLayout({ children }: ClientLayoutProps): JSX.Element {
  return (
    <>
      {children}
      <UpdateBanner />
    </>
  );
}
