'use client';

import type { ReactNode } from 'react';

export function Panel({
  title,
  aside,
  children,
  className = '',
  bodyClassName = 'p-3',
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`border-border bg-card flex min-h-0 flex-col rounded-xl border ${className}`}>
      <header className="border-border flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="text-[10px] font-medium tracking-[0.15em] uppercase">{title}</h2>
        {aside}
      </header>
      <div className={`min-h-0 flex-1 overflow-auto ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return (
    <div className="text-muted-foreground flex h-full min-h-24 items-center justify-center px-6 text-center text-xs leading-relaxed">
      <p>{children}</p>
    </div>
  );
}

export const TIER_TONE: Record<string, string> = {
  standard: 'border-zinc-500/40 text-zinc-400',
  bronze: 'border-amber-700/50 text-amber-600',
  silver: 'border-zinc-300/40 text-zinc-300',
  gold: 'border-yellow-500/50 text-yellow-400',
  platinum: 'border-cyan-300/50 text-cyan-200',
};

export const PRIORITY_LABEL: Record<string, string> = {
  fastest: 'fastest',
  cheapest: 'cheapest',
  most_comfortable: 'comfort',
  most_sustainable: 'green',
};
