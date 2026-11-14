import { flushSync } from 'react-dom';

/** Reveal the next sheet without remounting the current form. */
export function turnBookSheet(update: () => void) {
  if (!document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update();
    return;
  }
  document.startViewTransition(() => flushSync(update));
}
