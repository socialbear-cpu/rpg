import { describe, expect, it } from 'vitest';
import type { CharacterSheetDefinition } from '../../api';
import { availableOptions, pruneCharacterSheetValues } from './conditions';

const definition: CharacterSheetDefinition = {
  version: 1,
  steps: [{
    key: 'identity', label: 'Identidade', position: 0,
    components: [
      { key: 'origin', label: 'Origem', type: 'single_select', presentation: 'select', required: true, position: 0, width: 'full', show_on_card: false, options: [{ label: 'Cidade', value: 'city' }, { label: 'Campo', value: 'country' }] },
      { key: 'role', label: 'Função', type: 'single_select', presentation: 'select', required: true, position: 1, width: 'full', show_on_card: false, options: [
        { label: 'Guarda', value: 'guard', condition: { logic: 'all', rules: [{ component_key: 'origin', operator: 'equals', value: 'city' }] } },
        { label: 'Fazendeira', value: 'farmer', condition: { logic: 'all', rules: [{ component_key: 'origin', operator: 'equals', value: 'country' }] } },
      ] },
    ],
  }],
};

describe('conditional character-sheet options', () => {
  it('shows choices that match the previous answer', () => {
    const role = definition.steps[0]!.components[1]!;
    if (role.type !== 'single_select') throw new Error('Expected select component');
    expect(availableOptions(role, { origin: 'city' }).map((option) => option.value)).toEqual(['guard']);
  });

  it('clears a downstream answer when its option is no longer available', () => {
    expect(pruneCharacterSheetValues(definition, { origin: 'country', role: 'guard' })).toEqual({ origin: 'country' });
  });
});
