import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MessagesConversation } from '../src/features/messages/messages-page';
describe('account messages', () => {
 it('uses account names and group members without requiring characters', () => {
  const html=renderToStaticMarkup(createElement(MessagesConversation,{
   title:'Amigos',messages:[{id:'m',sender_user_id:'u',content:'Vamos jogar?',created_at:'2026-11-21T12:00:00Z'}],
   members:[{user_id:'u',display_name:'Ana',username:'ana'}],userId:'u',draft:'',busy:false,onDraft:vi.fn(),onSend:vi.fn(),
  }));
  expect(html).toContain('Ana');expect(html).toContain('Vamos jogar?');expect(html).not.toContain('Personagem');
 });
});
