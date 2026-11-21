import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RoomSettingsForm } from '../src/features/chats/room-settings';
import { LobbyCreatorTools } from '../src/features/characters/lobby-creator-tools';
import type { GameSystem, RoomSettings } from '../src/api';

describe('room configuration', () => {
  it('keeps the configured capacity and represents inherited individual permissions', () => {
    const settings: RoomSettings = {
      chat: { id: 'room', game_system_id: 'system', name: 'Taverna', description: null, created_at: '2026-11-21T12:00:00Z', status: 'active', max_players: 8, player_count: 2,
        permissions: { view: true, enter: false, write: false }, is_member: false, has_player_seat: false, can_manage: true },
      roles: [{ role: 'user', view: true, enter: true, write: false }], users: [{ user_id: 'ana', view: null, enter: false, write: null }],
      members: [{ user_id: 'ana', display_name: 'Ana', role: 'user' }],
    };
    const html = renderToStaticMarkup(createElement(RoomSettingsForm, { settings, busy: false, onSave: vi.fn() }));
    expect(html).toContain('value="8"');
    expect(html).toContain('<legend>Ana</legend>');
    expect(html).toContain('<option value="deny" selected="">Negar</option>');
    expect(html).toContain('<option value="inherit" selected="">Herdar do cargo</option>');
  });

  it('does not show creation to managers without the Owner role', () => {
    const html = renderToStaticMarkup(createElement(LobbyCreatorTools, {
      system: { id: 'system' } as GameSystem, characters: [], characterLoadError: null, canCreateRooms: false,
    }));
    expect(html).toContain('Gerenciar salas e permissões');
    expect(html).not.toContain('<form');
  });
});
