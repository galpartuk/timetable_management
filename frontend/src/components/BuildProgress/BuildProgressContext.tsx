import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { getTimetable, getTimetables } from '../../api/client';

/**
 * Global build-progress tracker. One poller lives at the app shell so a build
 * that starts on /timetable keeps streaming progress while the user clicks
 * over to /constraints or /dashboard — the per-page Timetable component used
 * to own the state and lose it on unmount.
 *
 * The store also drives the persistent banner in Layout so progress stays
 * visible regardless of which route is mounted. The Timetable page hooks
 * into the same store so its inline card stays in sync.
 */
export interface BuildProgress {
  timetableId: number;
  timetableName?: string;
  startedAtServer?: number; // epoch seconds (Timetable.progress.started_at)
  startedAtClient: number;  // ms, fallback anchor until first poll lands
  phase?: string;
  solutions?: number;
  objective?: number;
  maxTime?: number;
}

export type BuildOutcome =
  | { status: 'completed'; timetableId: number; timetableName?: string }
  | { status: 'failed'; timetableId: number; timetableName?: string; log?: string };

interface Api {
  build: BuildProgress | null;
  /** Last terminal outcome (cleared by ackOutcome). Drives a toast in Layout. */
  outcome: BuildOutcome | null;
  /** Caller has already triggered a build (POST /generate). Start polling. */
  trackBuild: (timetableId: number, opts?: { timetableName?: string }) => void;
  /** A timetable detail load discovered an already-running build. */
  adoptIfGenerating: (tt: { id: number; status: string; name?: string }) => void;
  ackOutcome: () => void;
}

const Ctx = createContext<Api | null>(null);

const SAFETY_NET_MS = 15 * 60 * 1000;   // 15 minutes
const POLL_INTERVAL_MS = 2000;

export function BuildProgressProvider({ children }: { children: ReactNode }) {
  const [build, setBuild] = useState<BuildProgress | null>(null);
  const [outcome, setOutcome] = useState<BuildOutcome | null>(null);
  const pollerRef = useRef<number | null>(null);
  const giveUpAtRef = useRef<number>(0);
  const trackedIdRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollerRef.current != null) {
      window.clearInterval(pollerRef.current);
      pollerRef.current = null;
    }
    trackedIdRef.current = null;
  }, []);

  const startPolling = useCallback((ttId: number, name?: string) => {
    if (trackedIdRef.current === ttId) return;
    stopPolling();
    trackedIdRef.current = ttId;
    giveUpAtRef.current = Date.now() + SAFETY_NET_MS;
    setBuild({
      timetableId: ttId,
      timetableName: name,
      startedAtClient: Date.now(),
      phase: 'starting',
      maxTime: 300,
    });
    setOutcome(null);

    const tick = async () => {
      try {
        const r = await getTimetable(ttId);
        const p = r.data.progress || {};
        const ttName = r.data.name as string | undefined;
        if (r.data.status === 'generating') {
          setBuild((prev) => prev && prev.timetableId === ttId ? {
            ...prev,
            timetableName: ttName ?? prev.timetableName,
            startedAtServer: p.started_at ?? prev.startedAtServer,
            phase: p.phase ?? prev.phase,
            solutions: p.solutions,
            objective: p.objective,
            maxTime: p.max_time_seconds ?? prev.maxTime ?? 300,
          } : prev);
          if (Date.now() > giveUpAtRef.current) {
            stopPolling();
            setBuild(null);
            setOutcome({
              status: 'failed', timetableId: ttId, timetableName: ttName,
              log: 'הבנייה לוקחת יותר מ-15 דקות — בדקו את לוג השרת.',
            });
          }
          return;
        }
        // Terminal state.
        stopPolling();
        setBuild(null);
        if (r.data.status === 'failed') {
          setOutcome({
            status: 'failed', timetableId: ttId, timetableName: ttName,
            log: (r.data.solver_log || '').trim(),
          });
        } else if (r.data.status === 'completed') {
          setOutcome({ status: 'completed', timetableId: ttId, timetableName: ttName });
        }
      } catch {
        // Network blip — keep polling until the safety net trips.
      }
    };

    // Fire immediately so the banner shows progress fast, then on interval.
    tick();
    pollerRef.current = window.setInterval(tick, POLL_INTERVAL_MS);
  }, [stopPolling]);

  const trackBuild = useCallback((ttId: number, opts?: { timetableName?: string }) => {
    startPolling(ttId, opts?.timetableName);
  }, [startPolling]);

  const adoptIfGenerating = useCallback((tt: { id: number; status: string; name?: string }) => {
    if (tt.status === 'generating' && trackedIdRef.current !== tt.id) {
      startPolling(tt.id, tt.name);
    }
  }, [startPolling]);

  const ackOutcome = useCallback(() => setOutcome(null), []);

  // On mount, scan for any orphaned 'generating' timetable so a reload while
  // a build is running re-attaches the banner without the user clicking anywhere.
  useEffect(() => {
    let cancelled = false;
    getTimetables()
      .then((r) => {
        if (cancelled) return;
        const list = r.data.results ?? [];
        const generating = list.find((tt: any) => tt.status === 'generating');
        if (generating) startPolling(generating.id, generating.name);
      })
      .catch(() => {});
    return () => { cancelled = true; stopPolling(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<Api>(() => ({
    build, outcome, trackBuild, adoptIfGenerating, ackOutcome,
  }), [build, outcome, trackBuild, adoptIfGenerating, ackOutcome]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBuildProgress(): Api {
  const v = useContext(Ctx);
  if (!v) throw new Error('useBuildProgress must be inside BuildProgressProvider');
  return v;
}
