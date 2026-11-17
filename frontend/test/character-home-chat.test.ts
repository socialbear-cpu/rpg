import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));
import { CharacterHome } from '../src/features/characters/character-home.js';

describe('character home chats', () => {
  it('uses the chat space for the active character instead of placeholder community rooms', () => {
    const html = renderToStaticMarkup(createElement(CharacterHome, {
      system: { id: '31000000-0000-4000-8000-000000000001', slug: 'forest', name: 'Floresta', description: null },
      character: { id: '51000000-0000-4000-8000-000000000001', game_system_id: '31000000-0000-4000-8000-000000000001', character_name: 'Liora', attributes: {}, status: 'active' },
      sheetDefinition: null, inventory: null, recordLoading: false, sheetError: null, inventoryError: null,
      onRefreshRecord: () => undefined, onSwitch: () => undefined,
    }));
    expect(html).toContain('Salas e conversas');
    expect(html).toContain('Conversas recentes');
    expect(html).toContain('lobby-character-record-action');
    expect(html).not.toContain('lobby-room-grid');
    expect(html).not.toContain('Taverna do Dragão');
    expect(html).not.toContain('O chat será conectado quando o serviço de salas estiver disponível.');
  });
});
