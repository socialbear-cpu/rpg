export interface CampaignChatDraftState {
  values: Record<string, string>;
  versions: Record<string, number>;
}

export const emptyCampaignChatDrafts: CampaignChatDraftState = { values: {}, versions: {} };

export function roomsForCurrentCharacter<T>(rooms: T[], roomsCharacterId: string | null, characterId: string): T[] {
  return roomsCharacterId === characterId ? rooms : [];
}

export function updateCampaignChatDraft(state: CampaignChatDraftState, key: string, value: string): CampaignChatDraftState {
  return {
    values: { ...state.values, [key]: value },
    versions: { ...state.versions, [key]: (state.versions[key] ?? 0) + 1 },
  };
}

export function clearCampaignChatDraftIfUnchanged(state: CampaignChatDraftState, key: string, version: number): CampaignChatDraftState {
  if ((state.versions[key] ?? 0) !== version) return state;
  return {
    values: { ...state.values, [key]: '' },
    versions: { ...state.versions, [key]: version + 1 },
  };
}
