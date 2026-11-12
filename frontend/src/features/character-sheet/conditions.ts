import type { CharacterSheetComponent, CharacterSheetConditionGroup, CharacterSheetConditionRule, CharacterSheetDefinition, CharacterSheetOption, CharacterSheetStep } from '../../api';

function isFilled(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  return value !== undefined && value !== null;
}

function matchesRule(rule: CharacterSheetConditionRule, values: Record<string, unknown>): boolean {
  const actual = values[rule.component_key];
  const expected = rule.value ?? '';
  switch (rule.operator) {
    case 'is_filled': return isFilled(actual);
    case 'is_empty': return !isFilled(actual);
    case 'equals': return !Array.isArray(actual) && actual !== undefined && String(actual) === expected;
    case 'not_equals': return Array.isArray(actual) || actual === undefined || String(actual) !== expected;
    case 'contains': return Array.isArray(actual) ? actual.includes(expected) : typeof actual === 'string' && actual.includes(expected);
    case 'not_contains': return Array.isArray(actual) ? !actual.includes(expected) : typeof actual !== 'string' || !actual.includes(expected);
  }
}

export function isConditionGroupMet(condition: CharacterSheetConditionGroup | undefined, values: Record<string, unknown>): boolean {
  if (!condition) return true;
  return condition.logic === 'all'
    ? condition.rules.every((rule) => matchesRule(rule, values))
    : condition.rules.some((rule) => matchesRule(rule, values));
}

export function getVisibleCharacterSheetOptions(component: CharacterSheetComponent, values: Record<string, unknown>): CharacterSheetOption[] {
  return component.type === 'single_select'
    ? component.options.filter((option) => isConditionGroupMet(option.condition, values))
    : [];
}

export function resolveVisibleCharacterSheetComponents(definition: CharacterSheetDefinition, values: Record<string, unknown>): {
  components: { step: CharacterSheetStep; component: CharacterSheetComponent }[];
  conditionValues: Record<string, unknown>;
} {
  const visible: { step: CharacterSheetStep; component: CharacterSheetComponent }[] = [];
  const conditionValues: Record<string, unknown> = {};
  for (const step of [...definition.steps].sort((a, b) => a.position - b.position)) {
    if (!isConditionGroupMet(step.condition, conditionValues)) continue;
    for (const component of [...step.components].sort((a, b) => a.position - b.position)) {
      if (!isConditionGroupMet(component.condition, conditionValues)) continue;
      const options = getVisibleCharacterSheetOptions(component, conditionValues);
      if (component.type === 'single_select' && options.length === 0) continue;
      visible.push({ step, component });

      const value = values[component.key];
      if (component.type === 'single_select') {
        const allowedValues = new Set(options.map(characterSheetOptionValue));
        if (component.selection_mode === 'multiple' && Array.isArray(value)) {
          const selected = [...new Set(value.filter((item): item is string => typeof item === 'string' && allowedValues.has(item)))];
          if (selected.length > 0) conditionValues[component.key] = selected;
        } else if (typeof value === 'string' && allowedValues.has(value)) {
          conditionValues[component.key] = value;
        }
      } else if (component.type === 'number') {
        const number = Number(value);
        if (value !== '' && value !== undefined && value !== null && Number.isFinite(number)) conditionValues[component.key] = number;
      } else if (typeof value === 'string' && value.trim()) {
        conditionValues[component.key] = value.trim();
      }
    }
  }
  return { components: visible, conditionValues };
}

export function getVisibleCharacterSheetComponents(definition: CharacterSheetDefinition, values: Record<string, unknown>) {
  return resolveVisibleCharacterSheetComponents(definition, values).components;
}

export function characterSheetOptionValue(option: CharacterSheetOption): string {
  return option.value ?? option.label;
}
