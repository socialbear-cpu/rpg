import { describe, expect, it } from 'vitest';
import { clearCampaignChatDraftIfUnchanged, emptyCampaignChatDrafts, roomsForCurrentCharacter, updateCampaignChatDraft } from '../src/features/campaign-chat/campaign-chat-state';

describe('campaign chat drafts', () => {
  it('keeps drafts separate by character and room', () => {
    const roomOne = 'character-one:room-one';
    const roomTwo = 'character-one:room-two';
    const otherCharacter = 'character-two:room-one';
    let state = updateCampaignChatDraft(emptyCampaignChatDrafts, roomOne, 'Rascunho um');
    state = updateCampaignChatDraft(state, roomTwo, 'Rascunho dois');
    state = updateCampaignChatDraft(state, otherCharacter, 'Outro personagem');

    expect(state.values).toEqual({ [roomOne]: 'Rascunho um', [roomTwo]: 'Rascunho dois', [otherCharacter]: 'Outro personagem' });
  });

  it('does not let a delayed send clear a newer draft for the same room', () => {
    const key = 'character-one:room-one';
    const submitted = updateCampaignChatDraft(emptyCampaignChatDrafts, key, 'Mensagem enviada');
    const edited = updateCampaignChatDraft(submitted, key, 'Novo rascunho');

    expect(clearCampaignChatDraftIfUnchanged(edited, key, submitted.versions[key]!)).toBe(edited);
    expect(edited.values[key]).toBe('Novo rascunho');
  });

  it('clears the submitted draft after success when it has not changed', () => {
    const key = 'character-one:room-one';
    const submitted = updateCampaignChatDraft(emptyCampaignChatDrafts, key, 'Mensagem enviada');
    const cleared = clearCampaignChatDraftIfUnchanged(submitted, key, submitted.versions[key]!);

    expect(cleared.values[key]).toBe('');
  });

  it('hides previous character rooms until the current character load succeeds', () => {
    const oldRooms = [{ id: 'old-room' }];
    expect(roomsForCurrentCharacter(oldRooms, 'old-character', 'new-character')).toEqual([]);
    expect(roomsForCurrentCharacter(oldRooms, 'new-character', 'new-character')).toBe(oldRooms);
  });
});
