import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SystemEventsList } from '../src/features/system-events/system-events-card.js';

const events = [{
  id: '70000000-0000-4000-8000-000000000001',
  game_system_id: '30000000-0000-4000-8000-000000000001',
  title: 'Sessão zero', description: 'Criar personagens e alinhar o tom.',
  starts_at: '2026-12-12T18:00:00.000Z', ends_at: '2026-12-12T20:00:00.000Z',
  started_at: null,
  created_at: '2026-11-14T12:00:00.000Z', updated_at: '2026-11-14T12:00:00.000Z',
}];

describe('system events list', () => {
  it('shows event title, optional description, and start/end times to members', () => {
    const html = renderToStaticMarkup(createElement(SystemEventsList, {
      events, canManage: false, onEdit: vi.fn(), onDelete: vi.fn(),
    }));
    expect(html).toContain('Sessão zero');
    expect(html).toContain('Criar personagens e alinhar o tom.');
    expect(html).toContain('Início');
    expect(html).toContain('Término');
    expect(html).not.toContain('Editar evento');
    expect(html).not.toContain('Excluir evento');
  });

  it('shows edit and remove controls only when the caller has management access', () => {
    const html = renderToStaticMarkup(createElement(SystemEventsList, {
      events, canManage: true, onEdit: vi.fn(), onDelete: vi.fn(),
    }));
    expect(html).toContain('aria-label="Editar evento Sessão zero"');
    expect(html).toContain('aria-label="Excluir evento Sessão zero"');
  });
});
