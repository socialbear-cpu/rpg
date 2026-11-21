import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { Dashboard } from '../src/features/dashboard/dashboard.js';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

it('offers a labelled carousel with manual controls and a direct path to systems', () => {
  const html = renderToStaticMarkup(createElement(Dashboard, { onLogout: vi.fn() }));
  expect(html).toContain('aria-roledescription="carrossel"');
  expect(html).toContain('aria-label="Destaque anterior"');
  expect(html).toContain('aria-label="Próximo destaque"');
  expect(html).toContain('aria-label="Mostrar destaque 3"');
  expect(html).toContain('href="#systems-title"');
});
