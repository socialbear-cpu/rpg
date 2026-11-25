'use client';

import { useEffect, useId, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { useBifrostScreenLoading } from '../loading/bifrost-loading';

export function trapDialogFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== 'Tab') return;
  const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]')]
    .filter((element) => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0);
  const first = controls[0];
  const last = controls.at(-1);
  if (!first || !last) { event.preventDefault(); return; }
  if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

export function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>, busy = false) {
  if (busy || event.target !== event.currentTarget) return;
  const bounds = event.currentTarget.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close();
}

export function Modal({ open, onClose, title, children, busy = false, className = '', actions }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode;
  busy?: boolean; className?: string; actions?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const screenLoading = useBifrostScreenLoading();

  useEffect(() => {
    const element = dialog.current;
    if (!open || !element || screenLoading) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.showModal();
    const initialFocus = element.querySelector<HTMLElement>('[data-modal-autofocus]');
    (initialFocus ?? heading.current)?.focus();
    return () => { element.close(); if (trigger?.isConnected) trigger.focus(); };
  }, [open, screenLoading]);

  return <dialog ref={dialog} className={`bifrost-modal ${className}`} aria-labelledby={titleId} aria-busy={busy || undefined}
    onKeyDown={trapDialogFocus}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    onClose={(event) => { if (open && !event.currentTarget.open) onClose(); }}
    onClick={(event) => {
      if (busy || event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}>
    <header className="bifrost-modal-heading"><div><p className="eyebrow">BIFROST RPG</p><h2 id={titleId} ref={heading} tabIndex={-1}>{title}</h2></div>
      <button className="bifrost-modal-close" type="button" disabled={busy} aria-label="Fechar" onClick={onClose}>×</button>
    </header>
    <div className="bifrost-modal-body">{children}</div>
    {actions && <footer className="bifrost-modal-actions">{actions}</footer>}
  </dialog>;
}
