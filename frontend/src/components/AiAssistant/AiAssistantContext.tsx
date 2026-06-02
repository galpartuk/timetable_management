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
  /** One-shot prefill — ChatPanel reads it on open and clears via consumePrefill. */
  prefill: string | null;
  /** When true, the chat hook auto-approves every tool proposal without
   *  showing a confirmation card. Paired with the snapshot/history system
   *  so the user can roll back if an auto-approved action was wrong. */
  autoApprove: boolean;
}

interface Api {
  state: State;
  setContext: (ctx: ModuleContext) => void;
  open: () => void;
  /** Open the panel with the input pre-filled (used by lesson popover handoffs). */
  openWith: (prefill: string) => void;
  close: () => void;
  toggle: () => void;
  consumePrefill: () => string | null;
  setAutoApprove: (on: boolean) => void;
}

const DEFAULT_CTX: ModuleContext = { module: 'global', viewState: {}, quickActions: [] };
const AUTO_APPROVE_KEY = 'ai_assistant.auto_approve';
const Ctx = createContext<Api | null>(null);

export function AiAssistantProvider({ children }: { children: ReactNode }) {
  const [ctx, setCtxState] = useState<ModuleContext>(DEFAULT_CTX);
  const [isOpen, setIsOpen] = useState(false);
  const [prefill, setPrefill] = useState<string | null>(null);
  const [autoApprove, setAutoApproveState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AUTO_APPROVE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const setContext = useCallback((next: ModuleContext) => setCtxState(next), []);
  const open = useCallback(() => setIsOpen(true), []);
  const openWith = useCallback((text: string) => {
    setPrefill(text);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const consumePrefill = useCallback(() => {
    const v = prefill;
    setPrefill(null);
    return v;
  }, [prefill]);
  const setAutoApprove = useCallback((on: boolean) => {
    setAutoApproveState(on);
    try {
      localStorage.setItem(AUTO_APPROVE_KEY, on ? '1' : '0');
    } catch {
      // localStorage unavailable (private mode, etc.) — in-memory is fine.
    }
  }, []);

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
    state: { ctx, isOpen, prefill, autoApprove },
    setContext, open, openWith, close, toggle, consumePrefill, setAutoApprove,
  }), [ctx, isOpen, prefill, autoApprove, setContext, open, openWith, close, toggle, consumePrefill, setAutoApprove]);

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
