import { describe, expect, it } from 'vitest';
import type { CharacterSheetDefinition } from '../../api';
import { definitionToLegacyFields } from './sheet-model';

describe('character-sheet model', () => {
  it('retains option labels for characters saved with stable option values', () => {
    const definition: CharacterSheetDefinition = {
      version: 1,
      steps: [{
        key: 'choices',
        label: 'Escolhas',
        position: 0,
        components: [{
          key: 'path',
          label: 'Caminho',
          type: 'single_select',
          required: true,
          position: 0,
          width: 'full',
          show_on_card: true,
          presentation: 'select',
          options: [{ label: 'Floresta', value: 'forest' }],
        }],
      }],
    };
    expect(definitionToLegacyFields(definition)[0]?.option_labels).toEqual({ forest: 'Floresta' });
  });
});
