import { describe, expect, it } from 'vitest';
import { clearChatDraftIfUnchanged, emptyChatDrafts, chatsForCurrentCharacter, updateChatDraft } from '../src/features/chats/chat-state';

describe('chat drafts', () => {
  it('keeps drafts separate by character and chat', () => {
    const chatOne = 'character-one:chat-one';
    const chatTwo = 'character-one:chat-two';
    const otherCharacter = 'character-two:chat-one';
    let state = updateChatDraft(emptyChatDrafts, chatOne, 'Rascunho um');
    state = updateChatDraft(state, chatTwo, 'Rascunho dois');
    state = updateChatDraft(state, otherCharacter, 'Outro personagem');
    expect(state.values).toEqual({ [chatOne]: 'Rascunho um', [chatTwo]: 'Rascunho dois', [otherCharacter]: 'Outro personagem' });
  });

  it('does not let a delayed send clear a newer draft for the same chat', () => {
    const key = 'character-one:chat-one';
    const submitted = updateChatDraft(emptyChatDrafts, key, 'Mensagem enviada');
    const edited = updateChatDraft(submitted, key, 'Novo rascunho');
    expect(clearChatDraftIfUnchanged(edited, key, submitted.versions[key]!)).toBe(edited);
    expect(edited.values[key]).toBe('Novo rascunho');
  });

  it('clears the submitted draft after success when it has not changed', () => {
    const key = 'character-one:chat-one';
    const submitted = updateChatDraft(emptyChatDrafts, key, 'Mensagem enviada');
    expect(clearChatDraftIfUnchanged(submitted, key, submitted.versions[key]!).values[key]).toBe('');
  });

  it('hides previous character chats until the current character load succeeds', () => {
    const oldChats = [{ id: 'old-chat' }];
    expect(chatsForCurrentCharacter(oldChats, 'old-character', 'new-character')).toEqual([]);
    expect(chatsForCurrentCharacter(oldChats, 'new-character', 'new-character')).toBe(oldChats);
  });
});
