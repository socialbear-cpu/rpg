import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SystemsSection } from '../src/features/dashboard/systems-section.js';

const systems = [
  { id: 'first', slug: 'first', name: 'Mundo primeiro', description: 'Uma história para contar.', play_mode: ['voice'] as ('text' | 'voice')[] },
  { id: 'archived', slug: 'archived', name: 'Mundo adormecido', description: null, is_active: false },
];
const props = { systems, loading: false, error: null, onCreate: vi.fn(), onEnter: vi.fn(), onManage: vi.fn() };

describe('compact systems dashboard', () => {
  it('presents systems in reading order with a direct play action for active systems', () => {
    const html = renderToStaticMarkup(createElement(SystemsSection, props));
    expect(html).toContain('<ul');
    expect(html).toContain('aria-label="Seus sistemas"');
    expect(html.indexOf('Mundo primeiro')).toBeLessThan(html.indexOf('Mundo adormecido'));
    expect(html.match(/>Jogar<\/button>/g)).toHaveLength(1);
    expect(html).not.toContain('Abra um novo caminho');
    expect(html).toContain('Jogar no sistema Mundo primeiro');
    expect(html).not.toContain('Jogar no sistema Mundo adormecido');
    expect(html).toContain('Aventura indisponível');
  });

  it.each([false, true])('only exposes management for owners or platform admins (admin: %s)', (isPlatformAdmin) => {
    const html = renderToStaticMarkup(createElement(SystemsSection, { ...props, ownerSystemIds: new Set(['archived']), isPlatformAdmin }));
    expect(html.includes('Gerenciar Mundo primeiro')).toBe(isPlatformAdmin);
    expect(html).toContain('Gerenciar Mundo adormecido');
  });

  it('offers the first system without an empty destination list', () => {
    const html = renderToStaticMarkup(createElement(SystemsSection, { ...props, systems: [] }));
    expect(html).toContain('Criar meu primeiro sistema');
    expect(html).not.toContain('<ul');
  });

  it('announces loading and errors without displaying stale destinations', () => {
    const loading = renderToStaticMarkup(createElement(SystemsSection, { ...props, loading: true }));
    const error = renderToStaticMarkup(createElement(SystemsSection, { ...props, error: 'Falha ao carregar.' }));
    expect(loading).toContain('role="status"');
    expect(error).toContain('role="alert"');
    expect(error).toContain('Falha ao carregar.');
    for (const html of [loading, error]) {
      expect(html).not.toContain('Jogar no sistema');
      expect(html).toContain('Criar sistema');
    }
  });
});

