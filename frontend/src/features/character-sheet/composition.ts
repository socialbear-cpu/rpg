import type { CharacterSheetComponent, CharacterSheetStep } from '../../api';

export function sheetCompositionKeys(step: CharacterSheetStep): string[] {
  const keys = new Set([
    ...(step.elements ?? []).map((element) => element.composition_key ?? 'composition_1'),
    ...step.components.flatMap((component) => component.type === 'visual_composition' ? [component.composition_key] : []),
  ]);
  return keys.size > 0 ? [...keys] : ['composition_1'];
}

export function activeSheetCompositionKey(step: CharacterSheetStep, requestedKey?: string): string {
  const keys = sheetCompositionKeys(step);
  return requestedKey && keys.includes(requestedKey) ? requestedKey : keys[0]!;
}

export function normalizeSingleVisualComposition(step: CharacterSheetStep): CharacterSheetStep {
  const compositions = step.components.filter((component) => component.type === 'visual_composition');
  if (compositions.length !== 1) return step;
  const compositionKey = compositions[0]!.composition_key;
  const elements = step.elements?.map((element) => ({ ...element, composition_key: compositionKey }));
  const components = step.components.map((component) => component.type === 'single_select' && component.presentation === 'canvas'
    ? { ...component, composition_key: compositionKey }
    : component);
  return { ...step, components, ...(elements ? { elements } : {}) };
}

export function canvasChoiceCompositionKey(step: CharacterSheetStep, component: Extract<CharacterSheetComponent, { type: 'single_select' }>): string {
  if (component.composition_key) return component.composition_key;
  return step.components
    .filter((item): item is Extract<CharacterSheetComponent, { type: 'visual_composition' }> => item.type === 'visual_composition')
    .sort((a, b) => a.position - b.position)[0]?.composition_key ?? 'composition_1';
}
