import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ChatPanel } from '../src/features/chats/chats';

const chat = {
  id: 'f3000000-0000-4000-8000-000000000001',
  game_system_id: 'f4000000-0000-4000-8000-000000000001',
  name: 'A Estrada Antiga', description: 'A jornada começa ao amanhecer.', status: 'active', created_at: '2026-11-15T12:00:00.000Z',
};
const messages = [{
  id: 'f5000000-0000-4000-8000-000000000001', chat_id: chat.id,
  character_id: 'f2000000-0000-4000-8000-000000000002', content: 'A missão começa!', created_at: '2026-11-15T12:00:00.000Z',
}];

describe('chat panel', () => {
  it('shows one chat and its activity in a single message timeline', () => {
    const html = renderToStaticMarkup(createElement(ChatPanel, {
      chats: [chat], selectedChatId: chat.id, messages, characterId: 'f2000000-0000-4000-8000-000000000001',
      content: '', loadingChats: false, loadingMessages: false, sending: false, error: null,
      onSelectChat: vi.fn(), onContentChange: vi.fn(), onSubmit: vi.fn(),
    }));
    expect(html).toContain('A Estrada Antiga');
    expect(html).toContain('A missão começa!');
    expect(html).toContain('for="chat-message">Mensagem para A Estrada Antiga</label>');
    expect(html).toContain('Enviar mensagem');
    expect(html).not.toContain('sala');
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
