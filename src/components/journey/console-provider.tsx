'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

import { useConsole } from '@/hooks/use-console';
import type { ContextNode } from '@/types';

type ConsoleState = ReturnType<typeof useConsole> & {
  selectedNode: ContextNode | null;
  setSelectedNode: (node: ContextNode | null) => void;
};

const ConsoleContext = createContext<ConsoleState | null>(null);

/**
 * One console state shared by all four screens.
 *
 * Mounted in the route-group layout, so navigating between screens keeps the
 * same journey selected and avoids refetching everything on every click.
 */
export function ConsoleProvider({ children }: { children: ReactNode }) {
  const console = useConsole();
  const [selectedNode, setSelectedNode] = useState<ContextNode | null>(null);

  return (
    <ConsoleContext.Provider value={{ ...console, selectedNode, setSelectedNode }}>
      {children}
    </ConsoleContext.Provider>
  );
}

export function useConsoleContext(): ConsoleState {
  const value = useContext(ConsoleContext);
  if (!value) throw new Error('useConsoleContext must be used inside <ConsoleProvider>');
  return value;
}
