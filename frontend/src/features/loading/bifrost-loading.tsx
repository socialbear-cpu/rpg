'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { mountBifrostScene } from './bifrost-scene';
import { createLoadingController, type LoadingState } from './loading-controller';

type Variant = 'screen' | 'panel' | 'inline';
const LoadingContext = createContext<((label: string) => () => void) | null>(null);
const LoadingVisibilityContext = createContext(false);

export function useBifrostScreenLoading() { return useContext(LoadingVisibilityContext); }

function LoadingVisual({ label, variant, departing = false }: { label: string; variant: Variant; departing?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<ReturnType<typeof mountBifrostScene> | null>(null);
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (!canvas.current) return;
    const animation = mountBifrostScene(canvas.current, variant === 'inline');
    scene.current = animation;
    return () => { animation.stop(); scene.current = null; };
  }, [variant]);
  useEffect(() => { scene.current?.setLeaving(departing); }, [departing]);

  return <span className={`bifrost-loading bifrost-loading--${variant}${departing ? ' bifrost-loading--departing' : ''}${entered ? ' bifrost-loading--settled' : ''}`} role="status" aria-live="polite" aria-atomic="true"
    onAnimationEnd={(event) => { if (event.target === event.currentTarget && event.animationName === 'bifrost-portal-open') setEntered(true); }}>
    <canvas className="bifrost-loading-canvas" ref={canvas} aria-hidden="true" />
    <span className="bifrost-loading-runes" aria-hidden="true">ᛒᛁᚠᚱᛟᛊᛏ</span>
    <span className="bifrost-loading-sr">{label}</span>
  </span>;
}

export function BifrostLoading({ label = 'Carregando…', variant = 'panel' }: { label?: string; variant?: Variant }) {
  const begin = useContext(LoadingContext);
  useEffect(() => {
    if (variant === 'screen' && begin) return begin(label);
  }, [begin, label, variant]);
  if (variant === 'screen' && begin) return <span className="bifrost-loading-sr" role="status" aria-live="polite" aria-atomic="true">{label}</span>;
  return <LoadingVisual label={label} variant={variant} />;
}

export function BifrostLoadingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LoadingState>({ phase: 'hidden', label: 'Carregando…' });
  const controller = useRef<ReturnType<typeof createLoadingController> | null>(null);
  if (!controller.current) controller.current = createLoadingController(setState);
  const focusBeforeLoading = useRef<HTMLElement | null>(null);
  const visible = state.phase !== 'hidden';
  const showing = useRef(false);
  showing.current = visible;
  const begin = useCallback((label: string) => {
    if (!showing.current && document.activeElement instanceof HTMLElement) focusBeforeLoading.current = document.activeElement;
    return controller.current!.begin(label);
  }, []);

  useEffect(() => () => controller.current?.dispose(), []);
  useEffect(() => {
    if (!visible) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      const previousFocus = focusBeforeLoading.current;
      if (previousFocus?.isConnected && !previousFocus.closest('[inert]')) previousFocus.focus({ preventScroll: true });
    };
  }, [visible]);

  return <LoadingContext.Provider value={begin}><LoadingVisibilityContext.Provider value={visible}>
    <div className="bifrost-loading-content" data-arriving={state.phase === 'departing' || undefined} inert={visible || undefined} aria-busy={visible || undefined}>{children}</div>
    {visible && createPortal(<LoadingVisual label={state.label} variant="screen" departing={state.phase === 'departing'} />, document.body)}
  </LoadingVisibilityContext.Provider></LoadingContext.Provider>;
}
