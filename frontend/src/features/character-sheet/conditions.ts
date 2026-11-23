import type { CharacterSheetComponent, CharacterSheetCondition, CharacterSheetDefinition } from '../../api';

function ruleMatches(condition: CharacterSheetCondition['rules'][number], values: Record<string, unknown>): boolean {
  const current = values[condition.component_key];
  const isFilled = Array.isArray(current) ? current.length > 0 : current !== undefined && current !== null && String(current).trim().length > 0;
  switch (condition.operator) {
    case 'is_filled': return isFilled;
    case 'is_empty': return !isFilled;
    case 'equals': return Array.isArray(current) ? current.includes(condition.value) : current === condition.value;
    case 'not_equals': return Array.isArray(current) ? !current.includes(condition.value) : current !== condition.value;
    case 'contains': return Array.isArray(current) ? current.includes(condition.value) : typeof current === 'string' && current.includes(condition.value ?? '');
    case 'not_contains': return Array.isArray(current) ? !current.includes(condition.value) : typeof current !== 'string' || !current.includes(condition.value ?? '');
  }
}

export function conditionMatches(condition: CharacterSheetCondition | undefined, values: Record<string, unknown>): boolean {
  if (!condition) return true;
  return condition.logic === 'all'
    ? condition.rules.every((rule) => ruleMatches(rule, values))
    : condition.rules.some((rule) => ruleMatches(rule, values));
}

export function availableOptions(component: Extract<CharacterSheetComponent, { type: 'single_select' }>, values: Record<string, unknown>) {
  return component.options.filter((option) => conditionMatches(option.condition, values));
}

export function nextSelectionValue(current: unknown, optionValue: string, multiple: boolean): string | string[] {
  if (!multiple) return optionValue;
  const selected = Array.isArray(current) ? current.filter((item): item is string => typeof item === 'string') : [];
  return selected.includes(optionValue)
    ? selected.filter((item) => item !== optionValue)
    : [...selected, optionValue];
}

export function pruneCharacterSheetValues(definition: CharacterSheetDefinition, values: Record<string, unknown>): Record<string, unknown> {
  const next = { ...values };
  const components = definition.steps.slice().sort((a, b) => a.position - b.position)
    .flatMap((step) => step.components.slice().sort((a, b) => a.position - b.position));
  for (const component of components) {
    if (component.type !== 'single_select' || next[component.key] === undefined) continue;
    const allowed = new Set(availableOptions(component, next).map((option) => option.value ?? option.label));
    const value = next[component.key];
    if (Array.isArray(value)) {
      const filtered = value.filter((item): item is string => typeof item === 'string' && allowed.has(item));
      if (filtered.length) next[component.key] = filtered;
      else delete next[component.key];
    } else if (typeof value !== 'string' || !allowed.has(value)) {
      delete next[component.key];
    }
  }
  return next;
}
