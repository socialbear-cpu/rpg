import { describe, expect, it } from 'vitest';
import type { CharacterSheetDefinition } from '../../api';
import { resolveVisibleCharacterSheetComponents } from './conditions';

const definition: CharacterSheetDefinition = {
  version: 1,
  steps: [
    {
      key: 'origin',
      label: 'Origem',
      position: 0,
      components: [{
        key: 'path',
        label: 'Caminho',
        type: 'single_select',
        required: true,
        position: 0,
        width: 'full',
        show_on_card: false,
        presentation: 'select',
        options: [{ label: 'Cidade', value: 'city' }, { label: 'Floresta', value: 'forest' }],
      }],
    },
    {
      key: 'city_details',
      label: 'Cidade',
      position: 1,
      condition: { logic: 'all', rules: [{ component_key: 'path', operator: 'equals', value: 'city' }] },
      components: [{
        key: 'district',
        label: 'Distrito',
        type: 'single_select',
        required: false,
        position: 0,
        width: 'full',
        show_on_card: false,
        presentation: 'select',
        options: [{ label: 'Centro', value: 'center' }],
      }],
    },
    {
      key: 'city_result',
      label: 'Resultado da cidade',
      position: 2,
      condition: { logic: 'all', rules: [{ component_key: 'district', operator: 'is_filled' }] },
      components: [{
        key: 'market',
        label: 'Mercado',
        type: 'short_text',
        required: false,
        position: 0,
        width: 'full',
        show_on_card: false,
      }],
    },
    {
      key: 'forest_result',
      label: 'Resultado da floresta',
      position: 3,
      condition: { logic: 'any', rules: [{ component_key: 'path', operator: 'equals', value: 'forest' }] },
      components: [{
        key: 'forest_name',
        label: 'Floresta',
        type: 'short_text',
        required: false,
        position: 0,
        width: 'full',
        show_on_card: false,
      }],
    },
  ],
};

describe('visible character-sheet components', () => {
  it('does not let stale answers from hidden conditional fields activate later pages', () => {
    const state = resolveVisibleCharacterSheetComponents(definition, {
      path: 'forest',
      district: 'center',
    });

    expect(state.components.map(({ component }) => component.key)).toEqual(['path', 'forest_name']);
    expect(state.conditionValues).toEqual({ path: 'forest' });
  });

  it('retains answers from currently visible earlier pages for all/any conditions', () => {
    const state = resolveVisibleCharacterSheetComponents(definition, {
      path: 'city',
      district: 'center',
    });

    expect(state.components.map(({ component }) => component.key)).toEqual(['path', 'district', 'market']);
    expect(state.conditionValues).toEqual({ path: 'city', district: 'center' });
  });
});
