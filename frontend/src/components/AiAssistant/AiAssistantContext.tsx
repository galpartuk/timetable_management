import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ModuleContext } from './types';

/**
 * Each page registers its own slice of context (which module it represents,
 * what's currently visible, and any module-specific quick-action prompts).
 * The global Command Center reads from this context every time it sends a
 * chat request.
 */
interface State {
  ctx: ModuleContext;
  isOpen: boolean;
}

interface Api {
  state: State;
  setContext: (ctx: ModuleContext) => void;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const DEFAULT_CTX: ModuleContext = { module: 'global', viewState: {}, quickActions: [] };
const Ctx = createContext<Api | null>(null);

export function AiAssistantProvider({ children }: { children: ReactNode }) {
  const [ctx, setCtxState] = useState<ModuleContext>(DEFAULT_CTX);
  const [isOpen, setIsOpen] = useState(false);

  const setContext = useCallback((next: ModuleContext) => setCtxState(next), []);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  // Cmd/Ctrl+K opens the Command Center from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  const value = useMemo<Api>(() => ({
    state: { ctx, isOpen },
    setContext, open, close, toggle,
  }), [ctx, isOpen, setContext, open, close, toggle]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAiAssistant(): Api {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAiAssistant must be used inside AiAssistantProvider');
  return v;
}

/**
 * Convenience hook for pages to register their context. Pass a stable
 * object reference (memoise viewState) — this fires whenever it changes.
 *
 *   useAiAssistantContext(useMemo(() => ({
 *     module: 'timetable',
 *     viewState: { timetableId, classId },
 *     quickActions: [...],
 *   }), [timetableId, classId]))
 */
export function useAiAssistantContext(ctx: ModuleContext) {
  const { setContext } = useAiAssistant();
  useEffect(() => {
    setContext(ctx);
    return () => setContext(DEFAULT_CTX);
  }, [ctx, setContext]);
}
