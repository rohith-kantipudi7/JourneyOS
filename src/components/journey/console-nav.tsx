'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useConsoleContext } from './console-provider';

const SCREENS = [
  { href: '/', label: 'Traveler', hint: 'What the customer sees' },
  { href: '/studio', label: 'Journey Studio', hint: 'Operator view + context graph' },
  { href: '/inspector', label: 'Decision Inspector', hint: 'Why this recommendation' },
  { href: '/audit', label: 'Audit Viewer', hint: 'Full trace' },
] as const;

export function ConsoleNav() {
  const pathname = usePathname();
  const console = useConsoleContext();

  const live = console.customers.filter((customer) => customer.eventCount > 0).length;

  return (
    <header className="border-border flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2.5">
      <Link href="/" className="text-base font-semibold tracking-tight">
        JourneyOS
      </Link>

      <nav className="flex items-center gap-1">
        {SCREENS.map((screen) => {
          const active = pathname === screen.href;
          return (
            <Link
              key={screen.href}
              href={screen.href}
              title={screen.hint}
              className={`rounded-md px-2.5 py-1 text-xs transition ${
                active ? 'bg-white/10 font-medium text-white' : 'text-muted-foreground hover:text-white'
              }`}
            >
              {screen.label}
            </Link>
          );
        })}
      </nav>

      {console.error && <span className="text-xs text-rose-400">{console.error}</span>}

      <div className="ml-auto flex items-center gap-3">
        <span className="text-muted-foreground font-mono text-[10px]">
          {live}/{console.customers.length} live
        </span>
        <button
          disabled={console.busy}
          onClick={() => void console.resetDemo()}
          className="border-border rounded border px-2 py-1 text-[10px] transition hover:border-white/40 disabled:opacity-40"
        >
          Reset demo
        </button>
      </div>
    </header>
  );
}
