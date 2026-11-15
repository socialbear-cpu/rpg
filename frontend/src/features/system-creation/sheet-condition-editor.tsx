'use client';

import type { CharacterSheetComponent, CharacterSheetConditionGroup, CharacterSheetConditionOperator, CharacterSheetConditionRule } from '../../api';

const valueOperators: CharacterSheetConditionOperator[] = ['equals', 'not_equals', 'contains', 'not_contains'];
const emptyOperators: CharacterSheetConditionOperator[] = ['is_filled', 'is_empty'];

function firstRule(component: CharacterSheetComponent): CharacterSheetConditionRule {
  return { component_key: component.key, operator: 'is_filled' };
}

export function SheetConditionEditor({ label, condition, availableComponents, onChange }: {
  label: string;
  condition?: CharacterSheetConditionGroup;
  availableComponents: CharacterSheetComponent[];
  onChange: (condition: CharacterSheetConditionGroup | undefined) => void;
}) {
  function updateRule(index: number, patch: Partial<CharacterSheetConditionRule>) {
    if (!condition) return;
    onChange({ ...condition, rules: condition.rules.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, ...patch } as CharacterSheetConditionRule : rule) });
  }

  function addRule() {
    if (availableComponents.length === 0) return;
    if (!condition) onChange({ logic: 'all', rules: [firstRule(availableComponents[0]!)] });
    else if (condition.rules.length < 20) onChange({ ...condition, rules: [...condition.rules, firstRule(availableComponents[0]!)] });
  }
}
