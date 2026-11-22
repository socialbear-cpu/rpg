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

export function canvasChoiceCompositionKey(step: CharacterSheetStep, component: Extract<CharacterSheetComponent, { type: 'single_select' }>): string {
  if (component.composition_key) return component.composition_key;
  return step.components
    .filter((item): item is Extract<CharacterSheetComponent, { type: 'visual_composition' }> => item.type === 'visual_composition')
    .sort((a, b) => a.position - b.position)[0]?.composition_key ?? 'composition_1';
}
