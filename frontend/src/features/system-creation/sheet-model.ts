import type { CharacterSheetComponent, CharacterSheetDefinition, CharacterSheetField, CharacterSheetVisualElement } from '../../api';

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
  return { version: 1, layout_mode: 'single_page', steps: [{ key: 'step_1', label: 'Ficha', position: 0, components: [], elements: [] }] };
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
  return definition.steps.flatMap((step) => step.components).filter((component) => component.type !== 'visual_composition').sort((a, b) => a.position - b.position).map((component, position) => ({
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

export function addSheetVisualElement(definition: CharacterSheetDefinition, stepKey: string, type: CharacterSheetVisualElement['type'], compositionKey = 'composition_1'): CharacterSheetDefinition {
  const element: CharacterSheetVisualElement = type === 'text'
    ? { key: `element_${globalThis.crypto.randomUUID().replaceAll('-', '')}`, composition_key: compositionKey, type, text: 'Novo texto', x: 5, y: 5, width: 30, height: 15, rotation: 0 }
    : { key: `element_${globalThis.crypto.randomUUID().replaceAll('-', '')}`, composition_key: compositionKey, type, image_url: '', description: '', x: 5, y: 5, width: 30, height: 25, rotation: 0 };
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
  const steps = orderedSteps(definition).filter((step) => step.key !== stepKey);
  if (steps.length === 0) return definition;
  return { ...definition, steps: reindexSteps(steps) };
}

export function moveSheetStep(definition: CharacterSheetDefinition, stepKey: string, direction: 'up' | 'down'): CharacterSheetDefinition {
  const steps = orderedSteps(definition);
  const index = steps.findIndex((step) => step.key === stepKey);
  const target = index + (direction === 'up' ? -1 : 1);
  if (index < 0 || target < 0 || target >= steps.length) return { ...definition, steps: reindexSteps(steps) };
  [steps[index], steps[target]] = [steps[target]!, steps[index]!];
  const next = { ...definition, steps: reindexSteps(steps) };
  return next;
}

export function addSheetComponent(definition: CharacterSheetDefinition, stepKey: string): CharacterSheetDefinition {
  return {
    ...definition,
    steps: definition.steps.map((step) => step.key === stepKey
      ? { ...step, components: [...reindexComponents(step.components), createEmptySheetComponent(step.components)] }
      : step),
  };
}

export function addSheetChoiceComponent(definition: CharacterSheetDefinition, stepKey: string): CharacterSheetDefinition {
  const step = definition.steps.find((item) => item.key === stepKey);
  if (!step) return definition;
  const component: Extract<CharacterSheetComponent, { type: 'single_select' }> = {
    key: `field_${globalThis.crypto.randomUUID().replaceAll('-', '')}`,
    label: 'Nova lista de opções',
    type: 'single_select',
    presentation: 'select',
    selection_mode: 'single',
    options: [
      { label: 'Opção 1', value: `option_${globalThis.crypto.randomUUID().replaceAll('-', '')}` },
      { label: 'Opção 2', value: `option_${globalThis.crypto.randomUUID().replaceAll('-', '')}` },
    ],
    required: false,
    position: step.components.length,
    width: 'full',
    show_on_card: false,
  };
  return { ...definition, steps: definition.steps.map((item) => item.key === stepKey ? { ...item, components: [...item.components, component] } : item) };
}

export function addSheetComposition(definition: CharacterSheetDefinition, stepKey: string): { definition: CharacterSheetDefinition; compositionKey: string } {
  const step = definition.steps.find((item) => item.key === stepKey);
  if (!step) return { definition, compositionKey: '' };
  const compositionKey = `comp_${globalThis.crypto.randomUUID().replaceAll('-', '')}`;
  const component: Extract<CharacterSheetComponent, { type: 'visual_composition' }> = {
    key: `field_${globalThis.crypto.randomUUID().replaceAll('-', '')}`,
    label: 'Composição visual',
    type: 'visual_composition',
    composition_key: compositionKey,
    required: false,
    position: step.components.length,
    width: 'full',
    show_on_card: false,
  };
  const element: CharacterSheetVisualElement = {
    key: `element_${globalThis.crypto.randomUUID().replaceAll('-', '')}`,
    composition_key: compositionKey,
    type: 'text',
    text: 'Novo texto',
    x: 5,
    y: 5,
    width: 30,
    height: 15,
    rotation: 0,
  };
  return {
    compositionKey,
    definition: { ...definition, steps: definition.steps.map((item) => item.key === stepKey ? { ...item, components: [...item.components, component], elements: [...(item.elements ?? []), element] } : item) },
  };
}

export function removeSheetComponent(definition: CharacterSheetDefinition, stepKey: string, componentKey: string): CharacterSheetDefinition {
  const next = {
    ...definition,
    steps: definition.steps.map((step) => step.key === stepKey
      ? { ...step, components: reindexComponents(step.components.filter((component) => component.key !== componentKey)) }
      : step),
  };
  return next;
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
  return next;
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
  return next;
}

export function isCharacterSheetDefinitionValid(definition: CharacterSheetDefinition | CharacterSheetField[]): boolean {
  if (Array.isArray(definition)) return isLegacyCharacterSheetDefinitionValid(definition);
  if (definition.version !== 1 || !['single_page', 'step_by_step'].includes(definition.layout_mode ?? 'step_by_step') || definition.steps.length < 1 || definition.steps.length > 20) return false;

  const stepKeys = new Set<string>();
  const stepPositions = new Set<number>();
  const componentKeys = new Set<string>();
  const elementKeys = new Set<string>();
  let componentCount = 0;
  let elementCount = 0;
  const priorChoices = new Map<string, Set<string>>();

  for (const step of [...definition.steps].sort((a, b) => a.position - b.position)) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(step.key) || stepKeys.has(step.key)) return false;
    if (!step.label.trim() || step.label.trim().length > 80) return false;
    if (!Number.isInteger(step.position) || step.position < 0 || step.position > 19 || stepPositions.has(step.position)) return false;
    if (step.components.length > 50) return false;

    const componentPositions = new Set<number>();
    const compositions = new Set((step.elements ?? []).map((element) => element.composition_key ?? 'composition_1'));
    const referencedCompositions = new Set<string>();
    for (const component of [...step.components].sort((a, b) => a.position - b.position)) {
      if (!/^[a-z][a-z0-9_]{0,39}$/.test(component.key) || componentKeys.has(component.key)) return false;
      if (!component.label.trim() || component.label.trim().length > 80) return false;
      if (!Number.isInteger(component.position) || component.position < 0 || component.position > 49 || componentPositions.has(component.position)) return false;
      if (!['full', 'half', 'third'].includes(component.width)) return false;
      if (typeof component.required !== 'boolean' || typeof component.show_on_card !== 'boolean') return false;
      if (!supportedTypes.has(component.type) && component.type !== 'visual_composition') return false;

      if (component.type === 'single_select') {
        if (!['select', 'cards', 'canvas'].includes(component.presentation) || ![undefined, 'single', 'multiple'].includes(component.selection_mode) || component.options.length < 1 || component.options.length > 50) return false;
        const labels = new Set<string>();
        const values = new Set<string>();
        for (const option of component.options) {
          if (!option.label.trim() || option.label.trim().length > 80 || labels.has(option.label.trim())) return false;
          const optionValue = option.value ?? option.label;
          if (!optionValue.trim() || optionValue.trim().length > 80 || values.has(optionValue.trim())) return false;
          if (option.description !== undefined && option.description.trim().length > 500) return false;
          if (option.condition) {
            if (!['all', 'any'].includes(option.condition.logic) || option.condition.rules.length < 1 || option.condition.rules.length > 20) return false;
            for (const rule of option.condition.rules) {
              if (!['equals', 'not_equals', 'contains', 'not_contains', 'is_filled', 'is_empty'].includes(rule.operator)) return false;
              const available = priorChoices.get(rule.component_key);
              const needsValue = ['equals', 'not_equals', 'contains', 'not_contains'].includes(rule.operator);
              if (!available || needsValue !== (rule.value !== undefined) || (rule.value !== undefined && (!rule.value.trim() || rule.value.length > 80 || !available.has(rule.value)))) return false;
            }
          }
          if (option.image_url !== undefined) {
            if (option.image_url.length > 2048) return false;
            try { if (new URL(option.image_url).protocol !== 'https:') return false; }
            catch { return false; }
          }
          const layout = [option.x, option.y, option.width, option.height, option.rotation];
          const hasLayout = layout.every((value) => value !== undefined);
          if ((component.presentation === 'canvas' && !hasLayout) || (layout.some((value) => value !== undefined) && !hasLayout)) return false;
          if (hasLayout && (!layout.every(Number.isFinite) || option.x! < 0 || option.y! < 0 || option.width! < 1 || option.height! < 1 || option.width! > 100 || option.height! > 100 || option.rotation! < -360 || option.rotation! > 360 || option.x! + option.width! > 100 || option.y! + option.height! > 100)) return false;
          labels.add(option.label.trim());
          values.add(optionValue.trim());
        }
        priorChoices.set(component.key, values);
      } else if (component.type === 'visual_composition') {
        if (!/^[a-z][a-z0-9_]{0,39}$/.test(component.composition_key) || !compositions.has(component.composition_key) || referencedCompositions.has(component.composition_key)) return false;
        referencedCompositions.add(component.composition_key);
      }

      componentKeys.add(component.key);
      componentPositions.add(component.position);
      componentCount++;
    }

    for (const element of step.elements ?? []) {
      if (!/^[a-z][a-z0-9_]{0,39}$/.test(element.key) || elementKeys.has(element.key)) return false;
      if (element.composition_key !== undefined && !/^[a-z][a-z0-9_]{0,39}$/.test(element.composition_key)) return false;
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
    if (step.components.some((component) => component.type === 'visual_composition') && (step.elements ?? []).length === 0) return false;

    stepKeys.add(step.key);
    stepPositions.add(step.position);
  }

  return componentCount <= 50 && elementCount <= 50;
}
