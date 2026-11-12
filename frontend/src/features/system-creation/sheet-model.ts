import type { CharacterSheetComponent, CharacterSheetConditionGroup, CharacterSheetDefinition, CharacterSheetField, CharacterSheetVisualElement } from '../../api';

const supportedTypes = new Set(['short_text', 'long_text', 'number', 'single_select']);

export function createEmptySheetField(fields: CharacterSheetField[]): CharacterSheetField {
  return {
    key: `field_${globalThis.crypto.randomUUID().replaceAll('-', '')}`,
    label: 'Novo campo',
    type: 'short_text',
    required: false,
    position: fields.length,
    show_on_card: false,
  };
}

function ordered(fields: CharacterSheetField[]) {
  return [...fields].sort((a, b) => a.position - b.position);
}

function reindex(fields: CharacterSheetField[]) {
  return fields.map((field, position) => ({ ...field, position }));
}

export function addSheetField(fields: CharacterSheetField[]) {
  return [...reindex(fields), createEmptySheetField(fields)];
}

export function removeSheetField(fields: CharacterSheetField[], fieldKey: string) {
  return reindex(ordered(fields).filter((field) => field.key !== fieldKey));
}

export function moveSheetField(fields: CharacterSheetField[], fieldKey: string, direction: 'up' | 'down') {
  const result = ordered(fields);
  const index = result.findIndex((field) => field.key === fieldKey);
  const target = index + (direction === 'up' ? -1 : 1);
  if (index < 0 || target < 0 || target >= result.length) return reindex(result);
  [result[index], result[target]] = [result[target]!, result[index]!];
  return reindex(result);
}

function isLegacyCharacterSheetDefinitionValid(fields: CharacterSheetField[]): boolean {
  if (fields.length > 50) return false;
  const keys = new Set<string>();
  const positions = new Set<number>();

  for (const field of fields) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(field.key) || keys.has(field.key)) return false;
    if (!field.label.trim() || field.label.trim().length > 80) return false;
    if (!Number.isInteger(field.position) || field.position < 0 || field.position > 49 || positions.has(field.position)) return false;
    if (typeof field.required !== 'boolean' || typeof field.show_on_card !== 'boolean') return false;
    if (!supportedTypes.has(field.type)) return false;

    if (field.type === 'single_select') {
      if (!field.options || field.options.length < 1 || field.options.length > 50) return false;
      if (field.options.some((option) => !option.trim() || option.trim().length > 80)) return false;
      if (new Set(field.options.map((option) => option.trim())).size !== field.options.length) return false;
    } else if (field.options !== undefined) {
      return false;
    }

    keys.add(field.key);
    positions.add(field.position);
  }

  return true;
}

function createEmptySheetComponent(components: CharacterSheetComponent[]): CharacterSheetComponent {
  return {
    key: `field_${globalThis.crypto.randomUUID().replaceAll('-', '')}`,
    label: 'Novo campo',
    type: 'short_text',
    required: false,
    position: components.length,
    width: 'full',
    show_on_card: false,
  };
}

export function createDefaultCharacterSheetDefinition(): CharacterSheetDefinition {
  return { version: 1, steps: [{ key: 'step_1', label: 'Etapa 1', position: 0, components: [], elements: [] }] };
}

export function legacyFieldsToDefinition(fields: CharacterSheetField[]): CharacterSheetDefinition {
  const components: CharacterSheetComponent[] = [...fields].sort((a, b) => a.position - b.position).map((field, position) => {
    const base = { key: field.key, label: field.label, required: field.required, position, width: 'full' as const, show_on_card: field.show_on_card };
    if (field.type === 'single_select') return { ...base, type: field.type, presentation: 'select' as const, options: (field.options ?? []).map((label) => ({ label })) };
    return { ...base, type: field.type } as CharacterSheetComponent;
  });
  return { version: 1, steps: [{ key: 'step_1', label: 'Etapa 1', position: 0, components }] };
}

export function definitionToLegacyFields(definition: CharacterSheetDefinition): CharacterSheetField[] {
  return definition.steps.flatMap((step) => step.components).sort((a, b) => a.position - b.position).map((component, position) => ({
    key: component.key, label: component.label, type: component.type, required: component.required,
    position, show_on_card: component.show_on_card,
    ...(component.type === 'single_select' ? {
      options: component.options.map((option) => option.label),
      option_labels: Object.fromEntries(component.options.map((option) => [option.value ?? option.label, option.label])),
    } : {}),
  }));
}

function orderedSteps(definition: CharacterSheetDefinition) {
  return [...definition.steps].sort((a, b) => a.position - b.position);
}

function reindexSteps(steps: CharacterSheetDefinition['steps']) {
  return steps.map((step, position) => ({ ...step, position }));
}

function reindexComponents(components: CharacterSheetComponent[]) {
  return components.map((component, position) => ({ ...component, position }));
}

function conditionsReferenceEarlierComponents(definition: CharacterSheetDefinition): boolean {
  const priorKeys = new Set<string>();
  const valid = (condition: CharacterSheetConditionGroup | undefined) => !condition || condition.rules.every((rule) => priorKeys.has(rule.component_key));
  for (const step of orderedSteps(definition)) {
    if (!valid(step.condition)) return false;
    for (const component of [...step.components].sort((a, b) => a.position - b.position)) {
      if (!valid(component.condition)) return false;
      if (component.type === 'single_select' && component.options.some((option) => !valid(option.condition))) return false;
      priorKeys.add(component.key);
    }
  }
  return true;
}

function removeConditionsReferencing(definition: CharacterSheetDefinition, componentKeys: Set<string>): CharacterSheetDefinition {
  const withoutReferences = (condition: CharacterSheetConditionGroup | undefined) => {
    if (!condition) return undefined;
    const rules = condition.rules.filter((rule) => !componentKeys.has(rule.component_key));
    return rules.length > 0 ? { ...condition, rules } : undefined;
  };
  return {
    ...definition,
    steps: definition.steps.map((step) => ({
      ...step,
      condition: withoutReferences(step.condition),
      components: step.components.map((component) => component.type === 'single_select'
        ? {
          ...component,
          condition: withoutReferences(component.condition),
          options: component.options.map((option) => ({ ...option, condition: withoutReferences(option.condition) })),
        }
        : { ...component, condition: withoutReferences(component.condition) }),
    })),
  };
}

export function addSheetStep(definition: CharacterSheetDefinition): CharacterSheetDefinition {
  const steps = reindexSteps(orderedSteps(definition));
  const next = {
    key: `step_${globalThis.crypto.randomUUID().replaceAll('-', '')}`,
    label: 'Nova etapa',
    position: steps.length,
    components: [],
    elements: [],
  };
  return { ...definition, steps: [...steps, next] };
}

export function addSheetVisualElement(definition: CharacterSheetDefinition, stepKey: string, type: CharacterSheetVisualElement['type']): CharacterSheetDefinition {
  const element: CharacterSheetVisualElement = type === 'text'
    ? { key: `element_${globalThis.crypto.randomUUID().replaceAll('-', '')}`, type, text: 'Novo texto', x: 5, y: 5, width: 30, height: 15, rotation: 0 }
    : { key: `element_${globalThis.crypto.randomUUID().replaceAll('-', '')}`, type, image_url: '', description: '', x: 5, y: 5, width: 30, height: 25, rotation: 0 };
  return {
    ...definition,
    steps: definition.steps.map((step) => step.key === stepKey
      ? { ...step, elements: [...(step.elements ?? []), element] }
      : step),
  };
}

export function removeSheetVisualElement(definition: CharacterSheetDefinition, stepKey: string, elementKey: string): CharacterSheetDefinition {
  return {
    ...definition,
    steps: definition.steps.map((step) => step.key === stepKey
      ? { ...step, elements: (step.elements ?? []).filter((element) => element.key !== elementKey) }
      : step),
  };
}

export function removeSheetStep(definition: CharacterSheetDefinition, stepKey: string): CharacterSheetDefinition {
  const removed = definition.steps.find((step) => step.key === stepKey);
  const steps = orderedSteps(definition).filter((step) => step.key !== stepKey);
  if (steps.length === 0) return definition;
  const next = { ...definition, steps: reindexSteps(steps) };
  return removeConditionsReferencing(next, new Set(removed?.components.map((component) => component.key) ?? []));
}

export function moveSheetStep(definition: CharacterSheetDefinition, stepKey: string, direction: 'up' | 'down'): CharacterSheetDefinition {
  const steps = orderedSteps(definition);
  const index = steps.findIndex((step) => step.key === stepKey);
  const target = index + (direction === 'up' ? -1 : 1);
  if (index < 0 || target < 0 || target >= steps.length) return { ...definition, steps: reindexSteps(steps) };
  [steps[index], steps[target]] = [steps[target]!, steps[index]!];
  const next = { ...definition, steps: reindexSteps(steps) };
  return conditionsReferenceEarlierComponents(next) ? next : definition;
}

export function addSheetComponent(definition: CharacterSheetDefinition, stepKey: string): CharacterSheetDefinition {
  return {
    ...definition,
    steps: definition.steps.map((step) => step.key === stepKey
      ? { ...step, components: [...reindexComponents(step.components), createEmptySheetComponent(step.components)] }
      : step),
  };
}

export function removeSheetComponent(definition: CharacterSheetDefinition, stepKey: string, componentKey: string): CharacterSheetDefinition {
  const next = {
    ...definition,
    steps: definition.steps.map((step) => step.key === stepKey
      ? { ...step, components: reindexComponents(step.components.filter((component) => component.key !== componentKey)) }
      : step),
  };
  return removeConditionsReferencing(next, new Set([componentKey]));
}

export function moveSheetComponent(definition: CharacterSheetDefinition, stepKey: string, componentKey: string, direction: 'up' | 'down'): CharacterSheetDefinition {
  const next = {
    ...definition,
    steps: definition.steps.map((step) => {
      if (step.key !== stepKey) return step;
      const components = [...step.components].sort((a, b) => a.position - b.position);
      const index = components.findIndex((component) => component.key === componentKey);
      const target = index + (direction === 'up' ? -1 : 1);
      if (index < 0 || target < 0 || target >= components.length) return { ...step, components: reindexComponents(components) };
      [components[index], components[target]] = [components[target]!, components[index]!];
      return { ...step, components: reindexComponents(components) };
    }),
  };
  return conditionsReferenceEarlierComponents(next) ? next : definition;
}

export function moveSheetComponentToStep(definition: CharacterSheetDefinition, sourceStepKey: string, targetStepKey: string, componentKey: string, targetPosition?: number): CharacterSheetDefinition {
  if (sourceStepKey === targetStepKey) return definition;
  const source = definition.steps.find((step) => step.key === sourceStepKey);
  const target = definition.steps.find((step) => step.key === targetStepKey);
  const component = source?.components.find((item) => item.key === componentKey);
  if (!source || !target || !component || target.components.length >= 50) return definition;
  const sourceComponents = reindexComponents(source.components.filter((item) => item.key !== componentKey));
  const targetComponents = [...target.components].sort((a,b)=>a.position-b.position);
  const position = Math.max(0, Math.min(targetPosition ?? targetComponents.length, targetComponents.length));
  targetComponents.splice(position, 0, { ...component, position });
  const next = { ...definition, steps: definition.steps.map((step) => step.key === sourceStepKey ? { ...step, components: sourceComponents } : step.key === targetStepKey ? { ...step, components: reindexComponents(targetComponents) } : step) };
  return conditionsReferenceEarlierComponents(next) ? next : definition;
}

function validCondition(condition: CharacterSheetConditionGroup | undefined, previousKeys: Set<string>) {
  if (!condition) return true;
  if (!['all', 'any'].includes(condition.logic) || condition.rules.length < 1 || condition.rules.length > 20) return false;
  return condition.rules.every((rule) => previousKeys.has(rule.component_key)
    && ['equals', 'not_equals', 'contains', 'not_contains', 'is_filled', 'is_empty'].includes(rule.operator)
    && (['is_filled', 'is_empty'].includes(rule.operator)
      ? rule.value === undefined
      : Boolean(rule.value?.trim()) && rule.value!.trim().length <= 80));
}

export function isCharacterSheetDefinitionValid(definition: CharacterSheetDefinition | CharacterSheetField[]): boolean {
  if (Array.isArray(definition)) return isLegacyCharacterSheetDefinitionValid(definition);
  if (definition.version !== 1 || definition.steps.length < 1 || definition.steps.length > 20) return false;

  const stepKeys = new Set<string>();
  const stepPositions = new Set<number>();
  const componentKeys = new Set<string>();
  const elementKeys = new Set<string>();
  let componentCount = 0;
  let elementCount = 0;

  for (const step of definition.steps) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(step.key) || stepKeys.has(step.key)) return false;
    if (!step.label.trim() || step.label.trim().length > 80) return false;
    if (!Number.isInteger(step.position) || step.position < 0 || step.position > 19 || stepPositions.has(step.position)) return false;
    if (step.components.length > 50) return false;

    const componentPositions = new Set<number>();
    for (const component of step.components) {
      if (!/^[a-z][a-z0-9_]{0,39}$/.test(component.key) || componentKeys.has(component.key)) return false;
      if (!component.label.trim() || component.label.trim().length > 80) return false;
      if (!Number.isInteger(component.position) || component.position < 0 || component.position > 49 || componentPositions.has(component.position)) return false;
      if (!['full', 'half', 'third'].includes(component.width)) return false;
      if (typeof component.required !== 'boolean' || typeof component.show_on_card !== 'boolean') return false;
      if (!supportedTypes.has(component.type)) return false;

      if (component.type === 'single_select') {
        if (!['select', 'cards', 'canvas'].includes(component.presentation) || ![undefined, 'single', 'multiple'].includes(component.selection_mode) || component.options.length < 1 || component.options.length > 50) return false;
        const labels = new Set<string>();
        const values = new Set<string>();
        for (const option of component.options) {
          if (!option.label.trim() || option.label.trim().length > 80 || labels.has(option.label.trim())) return false;
          const optionValue = option.value ?? option.label;
          if (!optionValue.trim() || optionValue.trim().length > 80 || values.has(optionValue.trim())) return false;
          if (option.description !== undefined && option.description.trim().length > 500) return false;
          if (option.image_url !== undefined) {
            if (option.image_url.length > 2048) return false;
            try { if (new URL(option.image_url).protocol !== 'https:') return false; }
            catch { return false; }
          }
          const layout = [option.x, option.y, option.width, option.height, option.rotation];
          const hasLayout = layout.every((value) => value !== undefined);
          if ((component.presentation === 'canvas' && !hasLayout) || (layout.some((value) => value !== undefined) && !hasLayout)) return false;
          if (hasLayout && (!layout.every(Number.isFinite) || option.x! < 0 || option.y! < 0 || option.width! < 1 || option.height! < 1 || option.width! > 100 || option.height! > 100 || option.rotation! < -360 || option.rotation! > 360 || option.x! + option.width! > 100 || option.y! + option.height! > 100)) return false;
          if (option.condition && (!['all', 'any'].includes(option.condition.logic) || option.condition.rules.length < 1 || option.condition.rules.length > 20)) return false;
          labels.add(option.label.trim());
          values.add(optionValue.trim());
        }
      }
      if (component.condition && (!['all', 'any'].includes(component.condition.logic) || component.condition.rules.length < 1 || component.condition.rules.length > 20)) return false;

      componentKeys.add(component.key);
      componentPositions.add(component.position);
      componentCount++;
    }

    for (const element of step.elements ?? []) {
      if (!/^[a-z][a-z0-9_]{0,39}$/.test(element.key) || elementKeys.has(element.key)) return false;
      if (![element.x, element.y, element.width, element.height, element.rotation].every(Number.isFinite)) return false;
      if (element.x < 0 || element.x > 100 || element.y < 0 || element.y > 100) return false;
      if (element.width < 1 || element.width > 100 || element.height < 1 || element.height > 100) return false;
      if (element.x + element.width > 100 || element.y + element.height > 100) return false;
      if (element.rotation < -360 || element.rotation > 360) return false;
      if (element.type === 'text') {
        if (!element.text.trim() || element.text.trim().length > 500) return false;
      } else if (element.type === 'image') {
        if (element.description !== undefined && element.description.trim().length > 500) return false;
        if (element.image_url.length > 2048) return false;
        try { if (new URL(element.image_url).protocol !== 'https:') return false; }
        catch { return false; }
      } else {
        return false;
      }
      elementKeys.add(element.key);
      elementCount++;
    }
    if (step.condition && (!['all', 'any'].includes(step.condition.logic) || step.condition.rules.length < 1 || step.condition.rules.length > 20)) return false;

    stepKeys.add(step.key);
    stepPositions.add(step.position);
  }

  const priorKeys = new Set<string>();
  for (const step of [...definition.steps].sort((a, b) => a.position - b.position)) {
    if (!validCondition(step.condition, priorKeys)) return false;
    for (const component of [...step.components].sort((a, b) => a.position - b.position)) {
      if (!validCondition(component.condition, priorKeys)) return false;
      if (component.type === 'single_select') {
        for (const option of component.options) if (!validCondition(option.condition, priorKeys)) return false;
      }
      priorKeys.add(component.key);
    }
  }

  return componentCount <= 50 && elementCount <= 50;
}
