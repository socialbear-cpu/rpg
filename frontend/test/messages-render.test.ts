import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MessagesConversation, MessagesPanel } from '../src/features/messages/messages-panel';
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
describe('account messages', () => {
 it('provides an explicit new-group action without requiring a player search', () => {
  const html = renderToStaticMarkup(createElement(MessagesPanel));
  expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*>Novo grupo<\/button>/);
  expect(html).not.toContain('Selecione jogadores na busca acima.');
  expect(html).not.toContain('<main');
  expect(html).not.toContain('class="app-header"');
 });
 it('uses account names and group members without requiring characters', () => {
  const html=renderToStaticMarkup(createElement(MessagesConversation,{
   title:'Amigos',messages:[{id:'m',sender_user_id:'u',content:'Vamos jogar?',created_at:'2026-11-21T12:00:00Z'}],
   members:[{user_id:'u',display_name:'Ana',username:'ana'}],userId:'u',draft:'',busy:false,onDraft:vi.fn(),onSend:vi.fn(),
  }));
  expect(html).toContain('Ana');expect(html).toContain('Vamos jogar?');expect(html).not.toContain('Personagem');
 });
});
