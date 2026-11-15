import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SystemLobbySettings } from '../src/api.js';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));
import { CharacterHome } from '../src/features/characters/character-home.js';
import { SystemEventsList } from '../src/features/system-events/system-events-card.js';

const system = { id: '31000000-0000-4000-8000-000000000001', slug: 'forest', name: 'Floresta', description: null };
const character = { id: '51000000-0000-4000-8000-000000000001', game_system_id: system.id, character_name: 'Liora', attributes: {}, status: 'active' as const };
const defaultSettings: SystemLobbySettings = {
  section_order: ['system-presentation', 'matchmaking', 'store', 'campaign-chat', 'events', 'character-sheet'],
  hidden_sections: [],
  welcome_title: 'Bem-vindo à aventura',
  welcome_message: 'Escolha onde sua próxima história começa.',
  accent_color: '#8B5CF6',
};

function renderLobby(isCreator: boolean, lobbySettings = defaultSettings) {
  return renderToStaticMarkup(createElement(CharacterHome, {
    system,
    character,
    sheetDefinition: null,
    inventory: null,
    recordLoading: false,
    sheetError: null,
    inventoryError: null,
    onRefreshRecord: () => undefined,
    onSwitch: () => undefined,
    isCreator,
    lobbySettings,
  } as never));
}

const startsAt = '2026-12-12T18:00:00.000Z';
const endsAt = '2026-12-12T20:00:00.000Z';
const event = {
  id: '71000000-0000-4000-8000-000000000001',
  game_system_id: system.id,
  title: 'Sessão zero',
  description: null,
  starts_at: startsAt,
  ends_at: endsAt,
  started_at: null,
  created_at: startsAt,
  updated_at: startsAt,
};

describe('lobby creator tools', () => {
  it('shows campaign, chat and event creator controls only to an Owner/Admin', () => {
    const ownerHtml = renderLobby(true);
    const memberHtml = renderLobby(false);
    expect(ownerHtml).toContain('Ferramentas do criador');
    expect(ownerHtml).toContain('Criar campanha');
    expect(ownerHtml).toContain('Personalizar saguão');
    expect(memberHtml).not.toContain('Ferramentas do criador');
    expect(memberHtml).not.toContain('Criar campanha');
    expect(memberHtml).toContain('Salas de bate-papo');
  });

  it('applies saved section order, hides selected sections and displays saved text/color for members', () => {
    const html = renderLobby(false, {
      section_order: ['campaign-chat', 'events', 'system-presentation', 'store', 'matchmaking', 'character-sheet'],
      hidden_sections: ['store', 'matchmaking'],
      welcome_title: 'Bem-vindos à Floresta',
      welcome_message: 'Preparem seus personagens.',
      accent_color: '#D946EF',
    });
    expect(html).toContain('Bem-vindos à Floresta');
    expect(html).toContain('Preparem seus personagens.');
    expect(html).toContain('--lobby-accent:#D946EF');
    expect(html.indexOf('Salas de bate-papo')).toBeLessThan(html.indexOf('AGENDA DO SISTEMA'));
    expect(html).not.toContain('Loja do sistema');
    expect(html).not.toContain('Procurar partida');
  });

  it('shows the quick chat creation link only when campaign chat is visible', () => {
    const visibleHtml = renderLobby(true, defaultSettings);
    const hiddenHtml = renderLobby(true, { ...defaultSettings, hidden_sections: ['campaign-chat'] });
    expect(visibleHtml).toContain('Criar uma sala de chat');
    expect(hiddenHtml).not.toContain('Criar uma sala de chat');
  });
});

describe('lobby event start action', () => {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const onStart = vi.fn();
  it('offers the start action to the Owner for a scheduled event', () => {
    const html = renderToStaticMarkup(createElement(SystemEventsList, {
      events: [event], canManage: true, onEdit, onDelete, onStart,
    } as never));
    expect(html).toContain('Iniciar evento Sessão zero');
    expect(html).not.toContain('Evento iniciado');
  });

  it('shows the started state and removes the action after an event was started', () => {
    const html = renderToStaticMarkup(createElement(SystemEventsList, {
      events: [{ ...event, started_at: startsAt }], canManage: true, onEdit, onDelete, onStart,
    } as never));
    expect(html).toContain('Evento iniciado');
    expect(html).not.toContain('Iniciar evento Sessão zero');
  });

  it('does not expose start controls to ordinary members', () => {
    const html = renderToStaticMarkup(createElement(SystemEventsList, {
      events: [event], canManage: false, onEdit, onDelete, onStart,
    } as never));
    expect(html).not.toContain('Iniciar evento Sessão zero');
  });
});
