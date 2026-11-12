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

  return <fieldset className="sheet-condition-editor">
    <legend>{label}</legend>
    <label className="sheet-checkbox"><input type="checkbox" checked={Boolean(condition)} disabled={availableComponents.length === 0} onChange={(event) => onChange(event.target.checked && availableComponents[0] ? { logic: 'all', rules: [firstRule(availableComponents[0])] } : undefined)} /><span>Usar condição de dependência</span></label>
    {availableComponents.length === 0 && <small>Adicione componentes anteriores para configurar uma condição.</small>}
    {condition && <>
      <label className="sheet-field-type-control"><span>Mostrar quando</span><select value={condition.logic} onChange={(event) => onChange({ ...condition, logic: event.target.value as 'all' | 'any' })}><option value="all">Todas as regras forem verdadeiras (E)</option><option value="any">Qualquer regra for verdadeira (OU)</option></select></label>
      {condition.rules.map((rule, index) => {
        const source = availableComponents.find((component) => component.key === rule.component_key) ?? availableComponents[0]!;
        return <div className="sheet-condition-rule" key={index}>
          <label><span>Componente</span><select value={rule.component_key} onChange={(event) => {
            const component = availableComponents.find((item) => item.key === event.target.value);
            if (component) updateRule(index, { ...firstRule(component), value: undefined });
          }}>{availableComponents.map((component) => <option key={component.key} value={component.key}>{component.label}</option>)}</select></label>
          <label><span>Operador</span><select value={rule.operator} onChange={(event) => {
            const operator = event.target.value as CharacterSheetConditionOperator;
            updateRule(index, valueOperators.includes(operator) ? { operator, value: '' } : { operator, value: undefined });
          }}>{valueOperators.map((operator) => <option key={operator} value={operator}>{operator === 'equals' ? 'é igual a' : operator === 'not_equals' ? 'é diferente de' : operator === 'contains' ? 'contém' : 'não contém'}</option>)}{emptyOperators.map((operator) => <option key={operator} value={operator}>{operator === 'is_filled' ? 'está preenchido' : 'está vazio'}</option>)}</select></label>
          {valueOperators.includes(rule.operator) && <label><span>Valor</span>{source.type === 'single_select' ? <select required value={rule.value ?? ''} onChange={(event) => updateRule(index, { value: event.target.value })}><option value="" disabled>Escolha um valor</option>{source.options.map((option) => <option key={option.value ?? option.label} value={option.value ?? option.label}>{option.label}</option>)}</select> : <input required maxLength={80} value={rule.value ?? ''} onChange={(event) => updateRule(index, { value: event.target.value })} />}</label>}
          <button type="button" className="sheet-remove-button" aria-label="Remover regra" onClick={() => onChange(condition.rules.length === 1 ? undefined : { ...condition, rules: condition.rules.filter((_, ruleIndex) => ruleIndex !== index) })}>Remover regra</button>
        </div>;
      })}
      <button type="button" className="sheet-add-button" disabled={condition.rules.length >= 20} onClick={addRule}>+ Adicionar regra</button>
    </>}
  </fieldset>;
}
