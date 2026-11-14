'use client';

import { Children, useEffect, useRef, useState, type ComponentProps } from 'react';

/** Keeps the form mounted while its content flows across fixed-size book pages. */
export function BookCategory({ children, inert, ...props }: ComponentProps<'section'>) {
  const [heading, ...content] = Children.toArray(children);
  const viewport = useRef<HTMLDivElement>(null);
  const flow = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);

  useEffect(() => {
    const frame = viewport.current;
    const content = flow.current;
    if (!frame || !content) return;
    let scheduled = 0;
    let active = true;
    const measure = () => {
      if (!active) return;
      cancelAnimationFrame(scheduled);
      scheduled = requestAnimationFrame(() => {
        const stride = frame.clientWidth + 40;
        const count = Math.max(1, Math.round((content.scrollWidth + 40) / stride));
        const current = Math.min(count - 1, Math.round(frame.scrollLeft / stride));
        setPageCount(count);
        setPage(current);
        frame.scrollLeft = current * stride;
      });
    };
    const resize = new ResizeObserver(measure);
    resize.observe(frame);
    const mutations = new MutationObserver(measure);
    mutations.observe(content, { childList: true, subtree: true, characterData: true, attributes: true });
    content.addEventListener('load', measure, true);
    document.fonts.ready.then(measure);
    measure();
    return () => {
      active = false;
      cancelAnimationFrame(scheduled);
      resize.disconnect();
      mutations.disconnect();
      content.removeEventListener('load', measure, true);
    };
  }, []);

  function turnPage(next: number) {
    const frame = viewport.current;
    if (!frame) return;
    frame.scrollLeft = next * (frame.clientWidth + 40);
    setPage(next);
  }

  return <section {...props}>
    <header className="system-book-chapter">{heading}</header>
    <div className="system-book-viewport" ref={viewport} onScroll={() => {
      const frame = viewport.current;
      if (frame) setPage(Math.round(frame.scrollLeft / (frame.clientWidth + 40)));
    }}>
      <div className="system-book-flow" ref={flow} inert={inert}>{content}</div>
    </div>
    <nav className="system-book-pagination" aria-label={`Páginas de ${props.id}`}>
      <button type="button" disabled={page === 0} onClick={() => turnPage(page - 1)} aria-label="Página anterior">← Anterior</button>
      <span role="status" aria-live="polite">{page + 1} / {pageCount}</span>
      <button type="button" disabled={page >= pageCount - 1} onClick={() => turnPage(page + 1)} aria-label="Próxima página">Próxima →</button>
    </nav>
  </section>;
}
