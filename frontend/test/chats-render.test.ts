import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ChatPanel } from '../src/features/chats/chats';

const chat = {
  id: 'f3000000-0000-4000-8000-000000000001',
  game_system_id: 'f4000000-0000-4000-8000-000000000001',
  name: 'A Estrada Antiga', description: 'A jornada começa ao amanhecer.', status: 'active', created_at: '2026-11-15T12:00:00.000Z',
  max_players: null, player_count: 1, permissions: { view: true, enter: true, write: true }, is_member: true, has_player_seat: true, can_manage: false,
};
const messages = [{
  id: 'f5000000-0000-4000-8000-000000000001', chat_id: chat.id,
  character_id: 'f2000000-0000-4000-8000-000000000002', content: 'A missão começa!', created_at: '2026-11-15T12:00:00.000Z',
}];

describe('chat panel', () => {
  it.each([true, false])('uses the contained Bifrost while loading chat data (rooms: %s)', (loadingChats) => {
    const html = renderToStaticMarkup(createElement(ChatPanel, {
      chats: [chat], selectedChatId: chat.id, messages, characterId: 'hero', content: '',
      loadingChats, loadingMessages: true, sending: false, error: null,
      onSelectChat: vi.fn(), onContentChange: vi.fn(), onSubmit: vi.fn(),
    }));
    expect(html).toContain('bifrost-loading--panel');
    expect(html).toContain(loadingChats ? 'Carregando chats…' : 'Carregando mensagens…');
    expect(html).not.toContain('A missão começa!');
  });
  it('shows one chat and its activity in a single message timeline', () => {
    const html = renderToStaticMarkup(createElement(ChatPanel, {
      chats: [chat], selectedChatId: chat.id, messages, characterId: 'f2000000-0000-4000-8000-000000000001',
      content: '', loadingChats: false, loadingMessages: false, sending: false, error: null,
      onSelectChat: vi.fn(), onContentChange: vi.fn(), onSubmit: vi.fn(),
    }));
    expect(html).toContain('A Estrada Antiga');
    expect(html).toContain('A missão começa!');
    expect(html).toContain('for="chat-message">Mensagem para A Estrada Antiga</label>');
    expect(html).toContain('CHAT DA MESA');
    expect(html).toContain('Enviar mensagem');
  });

  it('shows a direct empty-chat state without a separate room creation step', () => {
    const html = renderToStaticMarkup(createElement(ChatPanel, {
      chats: [], selectedChatId: null, messages: [], characterId: 'f2000000-0000-4000-8000-000000000001',
      content: '', loadingChats: false, loadingMessages: false, sending: false, error: null,
      onSelectChat: vi.fn(), onContentChange: vi.fn(), onSubmit: vi.fn(),
    }));
    expect(html).toContain('Este personagem ainda não participa de nenhum chat.');
    expect(html).not.toContain('Criar sala');
  });
});

describe('room permissions', () => {
  it('disables writing while allowing visible history before joining', () => {
    const html = renderToStaticMarkup(createElement(ChatPanel, {
      chats: [{ ...chat, permissions: { view: true, enter: true, write: true }, is_member: false, max_players: 1, player_count: 1, has_player_seat: false, can_manage: false }],
      selectedChatId: chat.id, messages, characterId: 'f2000000-0000-4000-8000-000000000001', content: 'Hello',
      loadingChats: false, loadingMessages: false, sending: false, error: null,
      onSelectChat: vi.fn(), onContentChange: vi.fn(), onSubmit: vi.fn(),
    }));
    expect(html).toContain('A missão começa!');
    expect(html).toMatch(/<textarea[^>]*disabled/);
    expect(html).toContain('Sala cheia');
  });
  it('never renders history or composer for management-only room access', () => {
    const html = renderToStaticMarkup(createElement(ChatPanel, {
      chats: [{ ...chat, permissions: { view: false, enter: false, write: false }, is_member: false, max_players: null, player_count: 0, has_player_seat: false, can_manage: true }],
      selectedChatId: chat.id, messages, characterId: 'f2000000-0000-4000-8000-000000000001', content: '',
      loadingChats: false, loadingMessages: false, sending: false, error: null,
      onSelectChat: vi.fn(), onContentChange: vi.fn(), onSubmit: vi.fn(),
    }));
    expect(html).not.toContain('A missão começa!');
    expect(html).not.toContain('<textarea');
    expect(html).toContain('Configurar sala');
  });
});
