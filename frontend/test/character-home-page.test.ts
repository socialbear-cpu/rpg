import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getGameSystems: vi.fn(),
  getSystemCharacters: vi.fn(),
  getCharacterSheet: vi.fn(),
  getCharacterExperience: vi.fn(),
}));

vi.mock('../src/api.js', () => api);

import { loadCharacterHomePageData } from '../src/features/characters/character-home-page.js';

const systemId = '30000000-0000-4000-8000-000000000001';
const characterId = '50000000-0000-4000-8000-000000000001';

describe('character home page loading', () => {
  beforeEach(() => vi.resetAllMocks());

  it('keeps the system home available when only the character sheet request fails', async () => {
    api.getGameSystems.mockResolvedValue({ systems: [{ id: systemId, name: 'Crônicas' }] });
    api.getSystemCharacters.mockResolvedValue({ characters: [{
      id: characterId, game_system_id: systemId, character_name: 'Ayla', status: 'active', attributes: {},
    }] });
    api.getCharacterSheet.mockRejectedValue(new Error('sheet unavailable'));
    api.getCharacterExperience.mockResolvedValue(null);

    await expect(loadCharacterHomePageData(systemId, characterId)).resolves.toMatchObject({
      system: { id: systemId, name: 'Crônicas' },
      character: { id: characterId, character_name: 'Ayla' },
      sheetDefinition: null,
      fields: [],
      sheetError: 'Não foi possível carregar a ficha deste personagem. Tente novamente.',
    });
  });

  it('rejects when loading the system list fails', async () => {
    const failure = new Error('systems unavailable');
    api.getGameSystems.mockRejectedValue(failure);
    api.getSystemCharacters.mockResolvedValue({ characters: [] });
    api.getCharacterSheet.mockResolvedValue({ definition: { version: 1, steps: [] } });
    api.getCharacterExperience.mockResolvedValue(null);

    await expect(loadCharacterHomePageData(systemId, characterId)).rejects.toBe(failure);
  });

  it('rejects when loading the system characters fails', async () => {
    const failure = new Error('characters unavailable');
    api.getGameSystems.mockResolvedValue({ systems: [{ id: systemId, name: 'Crônicas' }] });
    api.getSystemCharacters.mockRejectedValue(failure);
    api.getCharacterSheet.mockResolvedValue({ definition: { version: 1, steps: [] } });
    api.getCharacterExperience.mockResolvedValue(null);

    await expect(loadCharacterHomePageData(systemId, characterId)).rejects.toBe(failure);
  });
});
