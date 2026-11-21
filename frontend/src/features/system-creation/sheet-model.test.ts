import { describe, expect, it } from 'vitest';
import type { CharacterSheetDefinition } from '../../api';
import { addSheetComposition, createDefaultCharacterSheetDefinition, definitionToLegacyFields, isCharacterSheetDefinitionValid } from './sheet-model';

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

  it('adds a visual composition as an ordered sheet component', () => {
    const result = addSheetComposition(createDefaultCharacterSheetDefinition(), 'step_1');
    expect(result.definition.steps[0]!.components[0]).toMatchObject({ type: 'visual_composition', composition_key: result.compositionKey, position: 0 });
    expect(result.definition.steps[0]!.elements?.[0]?.composition_key).toBe(result.compositionKey);
    expect(isCharacterSheetDefinitionValid(result.definition)).toBe(true);
  });
});
