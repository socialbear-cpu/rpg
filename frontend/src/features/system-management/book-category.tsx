'use client';

import { Children, useEffect, useRef, useState, type ComponentProps } from 'react';

/** Keeps the form mounted while its content flows across fixed-size book pages. */
export function BookCategory({ children, inert, ...props }: ComponentProps<'section'>) {
  const [heading, ...content] = Children.toArray(children);
  const viewport = useRef<HTMLDivElement>(null);
  const flow = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLSpanElement>(null);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [visiblePages, setVisiblePages] = useState(2);

  function geometry() {
    const frame = viewport.current;
    const content = flow.current;
    if (!frame || !content) return null;
    const style = getComputedStyle(content);
    const columns = Number(style.columnCount) || 1;
    const gap = parseFloat(style.columnGap) || 0;
    return { columns, gap, stride: (frame.clientWidth + gap) / columns };
  }

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
        const layout = geometry();
        if (!layout) return;
        const { columns, gap, stride } = layout;
        const count = Math.max(columns, Math.round((content.scrollWidth + gap) / stride));
        const last = Math.floor((count - 1) / columns) * columns;
        const current = Math.min(last, Math.round(frame.scrollLeft / (stride * columns)) * columns);
        if (end.current) end.current.style.left = `${Math.ceil(count / columns) * columns * stride - gap - 1}px`;
        setVisiblePages(columns);
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
    const layout = geometry();
    if (!frame || !layout) return;
    frame.scrollLeft = next * layout.stride;
    setPage(next);
  }

  return <section {...props}>
    <header className="system-book-chapter">{heading}</header>
    <div className="system-book-viewport" ref={viewport} onScroll={() => {
      const frame = viewport.current;
      const layout = geometry();
      if (frame && layout) setPage(Math.round(frame.scrollLeft / (layout.stride * layout.columns)) * layout.columns);
    }}>
      <div className="system-book-flow" ref={flow} inert={inert}>{content}</div>
      <span className="system-book-end" ref={end} aria-hidden="true" />
    </div>
    <nav className="system-book-pagination" aria-label={`Páginas de ${props.id}`}>
      <button type="button" disabled={page === 0} onClick={() => turnPage(page - visiblePages)} aria-label="Páginas anteriores">← Anterior</button>
      <span role="status" aria-live="polite">{visiblePages === 2 ? `Páginas ${page + 1}–${page + 2}` : `Página ${page + 1}`} de {Math.ceil(pageCount / visiblePages) * visiblePages}</span>
      <button type="button" disabled={page + visiblePages >= pageCount} onClick={() => turnPage(page + visiblePages)} aria-label="Próximas páginas">Próxima →</button>
    </nav>
  </section>;
}
