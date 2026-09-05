import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'JourneyOS — The Operating System for Customer Journeys',
  description:
    'An event-driven, trust-governed customer journey orchestration platform. AI proposes, deterministic policy authorizes, typed adapters execute.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
