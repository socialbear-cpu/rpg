export interface ChatDraftState {
  values: Record<string, string>;
  versions: Record<string, number>;
}

export const emptyChatDrafts: ChatDraftState = { values: {}, versions: {} };

export function chatsForCurrentCharacter<T>(chats: T[], chatsCharacterId: string | null, characterId: string): T[] {
  return chatsCharacterId === characterId ? chats : [];
}

export function updateChatDraft(state: ChatDraftState, key: string, value: string): ChatDraftState {
  return {
    values: { ...state.values, [key]: value },
    versions: { ...state.versions, [key]: (state.versions[key] ?? 0) + 1 },
  };
}

export function clearChatDraftIfUnchanged(state: ChatDraftState, key: string, version: number): ChatDraftState {
  if ((state.versions[key] ?? 0) !== version) return state;
  return {
    values: { ...state.values, [key]: '' },
    versions: { ...state.versions, [key]: version + 1 },
  };
}
