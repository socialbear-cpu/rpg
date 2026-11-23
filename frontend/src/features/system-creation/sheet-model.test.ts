import { describe, expect, it } from 'vitest';
import type { CharacterSheetDefinition } from '../../api';
import { canvasChoiceCompositionKey, activeSheetCompositionKey, normalizeSingleVisualComposition } from '../character-sheet/composition';
import { addSheetComposition, createDefaultCharacterSheetDefinition, definitionToLegacyFields, isCharacterSheetDefinitionValid, removeSheetComposition } from './sheet-model';

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

  it('keeps legacy canvas choices with the first configured composition and resets stale selection', () => {
    const step: CharacterSheetDefinition['steps'][number] = {
      key: 'step_1', label: 'Ficha', position: 0,
      components: [
        { key: 'art_a', label: 'Arte A', type: 'visual_composition', composition_key: 'art_a', required: false, position: 1, width: 'full', show_on_card: false },
        { key: 'art_b', label: 'Arte B', type: 'visual_composition', composition_key: 'art_b', required: false, position: 2, width: 'full', show_on_card: false },
        { key: 'legacy_choice', label: 'Escolha antiga', type: 'single_select', presentation: 'canvas', required: false, position: 3, width: 'full', show_on_card: false, options: [{ label: 'A' }] },
      ],
      elements: [],
    };
    expect(canvasChoiceCompositionKey(step, step.components[2] as Extract<CharacterSheetDefinition['steps'][number]['components'][number], { type: 'single_select' }>)).toBe('art_a');
    expect(activeSheetCompositionKey(step, 'removed_art')).toBe('art_a');
    expect(activeSheetCompositionKey(step, 'art_b')).toBe('art_b');
  });

  it('aligns canvas options and visual elements to the only visual composition before saving', () => {
    const step: CharacterSheetDefinition['steps'][number] = {
      key: 'step_1', label: 'Ficha', position: 0,
      components: [
        { key: 'art', label: 'Composição visual', type: 'visual_composition', composition_key: 'art', required: false, position: 0, width: 'full', show_on_card: false },
        { key: 'villages', label: 'Vilas', type: 'single_select', presentation: 'canvas', composition_key: 'composition_1', required: true, position: 1, width: 'full', show_on_card: false, options: [{ label: 'Kiri', x: 5, y: 5, width: 28, height: 35, rotation: 0 }] },
      ],
      elements: [{ key: 'title', composition_key: 'composition_1', type: 'text', text: 'Escolha sua vila', x: 5, y: 5, width: 30, height: 15, rotation: 0 }],
    };

    const normalized = normalizeSingleVisualComposition(step);
    expect(normalized.components.find((component) => component.key === 'villages')).toMatchObject({ composition_key: 'art' });
    expect(normalized.elements?.[0]?.composition_key).toBe('art');
    expect(step.components.find((component) => component.key === 'villages')).toMatchObject({ composition_key: 'composition_1' });
  });

  it('removes a composition together with its own visual elements and canvas choices', () => {
    const composition = addSheetComposition(createDefaultCharacterSheetDefinition(), 'step_1');
    const compositionComponent = composition.definition.steps[0]!.components[0]!;
    const otherComposition = addSheetComposition(composition.definition, 'step_1');
    const firstCompositionKey = composition.compositionKey;
    const secondCompositionKey = otherComposition.compositionKey;
    const firstChoice = { key: 'choice_a', label: 'Escolha A', type: 'single_select' as const, presentation: 'canvas' as const, composition_key: firstCompositionKey, required: false, position: 2, width: 'full' as const, show_on_card: false, options: [{ label: 'A', x: 5, y: 5, width: 28, height: 35, rotation: 0 }] };
    const secondChoice = { ...firstChoice, key: 'choice_b', label: 'Escolha B', composition_key: secondCompositionKey, position: 3 };
    const withChoices: CharacterSheetDefinition = {
      ...otherComposition.definition,
      steps: otherComposition.definition.steps.map((step) => ({ ...step, components: [...step.components, firstChoice, secondChoice] })),
    };
    const removed = removeSheetComposition(withChoices, 'step_1', compositionComponent.key);
    expect(removed.steps[0]!.components.map((component) => component.key)).toContain('choice_b');
    expect(removed.steps[0]!.components.map((component) => component.key)).not.toContain('choice_a');
    expect(removed.steps[0]!.elements?.every((element) => element.composition_key !== firstCompositionKey)).toBe(true);
    expect(removed.steps[0]!.elements?.some((element) => element.composition_key === secondCompositionKey)).toBe(true);
    expect(isCharacterSheetDefinitionValid(removed)).toBe(true);
  });
});
