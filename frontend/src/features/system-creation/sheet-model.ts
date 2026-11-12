import type { CharacterSheetComponent, CharacterSheetDefinition, CharacterSheetField } from '../../api';

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
  return { version: 1, steps: [{ key: 'step_1', label: 'Etapa 1', position: 0, components: [] }] };
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
    ...(component.type === 'single_select' ? { options: component.options.map((option) => option.label) } : {}),
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
  };
  return { ...definition, steps: [...steps, next] };
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
  return { ...definition, steps: reindexSteps(steps) };
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
  return {
    ...definition,
    steps: definition.steps.map((step) => step.key === stepKey
      ? { ...step, components: reindexComponents(step.components.filter((component) => component.key !== componentKey)) }
      : step),
  };
}

export function moveSheetComponent(definition: CharacterSheetDefinition, stepKey: string, componentKey: string, direction: 'up' | 'down'): CharacterSheetDefinition {
  return {
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
  return { ...definition, steps: definition.steps.map((step) => step.key === sourceStepKey ? { ...step, components: sourceComponents } : step.key === targetStepKey ? { ...step, components: reindexComponents(targetComponents) } : step) };
}

export function isCharacterSheetDefinitionValid(definition: CharacterSheetDefinition | CharacterSheetField[]): boolean {
  if (Array.isArray(definition)) return isLegacyCharacterSheetDefinitionValid(definition);
  if (definition.version !== 1 || definition.steps.length < 1 || definition.steps.length > 20) return false;

  const stepKeys = new Set<string>();
  const stepPositions = new Set<number>();
  const componentKeys = new Set<string>();
  let componentCount = 0;

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
        if (!['select', 'cards'].includes(component.presentation) || component.options.length < 1 || component.options.length > 50) return false;
        const labels = new Set<string>();
        for (const option of component.options) {
          if (!option.label.trim() || option.label.trim().length > 80 || labels.has(option.label.trim())) return false;
          if (option.description !== undefined && option.description.trim().length > 500) return false;
          if (option.image_url !== undefined) {
            if (option.image_url.length > 2048) return false;
            try { if (new URL(option.image_url).protocol !== 'https:') return false; }
            catch { return false; }
          }
          labels.add(option.label.trim());
        }
      }

      componentKeys.add(component.key);
      componentPositions.add(component.position);
      componentCount++;
    }

    stepKeys.add(step.key);
    stepPositions.add(step.position);
  }

  return componentCount <= 50;
}
