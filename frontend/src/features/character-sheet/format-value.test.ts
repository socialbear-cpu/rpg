import { describe, expect, it } from 'vitest';
import type { CharacterSheetField } from '../../api';
import { formatCharacterSheetValue } from './format-value';

describe('character-sheet value display', () => {
  it('shows labels for stable single and multiple option values', () => {
    const field: CharacterSheetField = {
      key: 'interests',
      label: 'Interesses',
      type: 'single_select',
      required: false,
      position: 0,
      show_on_card: true,
      options: ['Mapas', 'Guildas'],
      option_labels: { maps: 'Mapas', guilds: 'Guildas' },
    };

    expect(formatCharacterSheetValue(field, 'maps')).toBe('Mapas');
    expect(formatCharacterSheetValue(field, ['maps', 'guilds'])).toBe('Mapas, Guildas');
  });
});
