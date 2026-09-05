import type { ReactNode } from 'react';

import { ConsoleNav } from '@/components/journey/console-nav';
import { ConsoleProvider } from '@/components/journey/console-provider';

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <ConsoleProvider>
      <div className="flex h-screen flex-col">
        <ConsoleNav />
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </ConsoleProvider>
  );
}
