'use client';

import { useEffect, useRef } from 'react';

/** Dismiss a non-modal surface without taking focus away from the page. */
export function usePopoverDismiss(open: boolean, setOpen: (open: boolean) => void, busy = false) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || busy) return;
    function dismiss(event: KeyboardEvent | PointerEvent) {
      if (event instanceof KeyboardEvent) {
        if (event.key !== 'Escape' || document.querySelector('dialog:modal')) return;
        setOpen(false);
        container.current?.querySelector('button')?.focus();
      } else if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('keydown', dismiss);
    document.addEventListener('pointerdown', dismiss);
    return () => {
      document.removeEventListener('keydown', dismiss);
      document.removeEventListener('pointerdown', dismiss);
    };
  }, [open, busy, setOpen]);
  return container;
}
