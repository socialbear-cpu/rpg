import { describe, expect, it } from 'vitest';
import type { CharacterSheetDefinition } from '../../api';
import { isCharacterSheetDefinitionValid, definitionToLegacyFields, moveSheetComponent, removeSheetComponent } from './sheet-model';

const dependentDefinition: CharacterSheetDefinition = {
  version: 1,
  steps: [{
    key: 'details',
    label: 'Detalhes',
    position: 0,
    components: [
      { key: 'origin', label: 'Origem', type: 'short_text', required: true, position: 0, width: 'full', show_on_card: false },
      {
        key: 'city',
        label: 'Cidade',
        type: 'short_text',
        required: false,
        position: 1,
        width: 'full',
        show_on_card: false,
        condition: { logic: 'all', rules: [{ component_key: 'origin', operator: 'is_filled' }] },
      },
    ],
  }],
};

describe('character-sheet condition editing', () => {
  it('prevents moving a component after a component that depends on it', () => {
    expect(moveSheetComponent(dependentDefinition, 'details', 'origin', 'down')).toBe(dependentDefinition);
  });

  it('removes dependent rules when their source component is deleted', () => {
    const updated = removeSheetComponent(dependentDefinition, 'details', 'origin');
    expect(updated.steps[0]!.components).toHaveLength(1);
    expect(updated.steps[0]!.components[0]!.condition).toBeUndefined();
    expect(isCharacterSheetDefinitionValid(updated)).toBe(true);
  });

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
