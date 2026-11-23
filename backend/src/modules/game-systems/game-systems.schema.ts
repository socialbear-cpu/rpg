import { z } from 'zod';

const keySchema = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);
const labelSchema = z.string().trim().min(1).max(80);
const systemTagSlugsSchema = z.array(z.string().regex(/^[a-z][a-z0-9-]{0,39}$/))
  .max(5)
  .refine((tags) => new Set(tags).size === tags.length);
const playModesSchema = z.array(z.enum(['text', 'voice'])).min(1).max(2).refine((modes) => new Set(modes).size === modes.length);
const componentBaseSchema = {
  key: keySchema,
  label: labelSchema,
  required: z.boolean(),
  position: z.number().int().min(0).max(49),
  width: z.enum(['full', 'half', 'third']),
  show_on_card: z.boolean(),
};

const conditionSchema = z.strictObject({
  logic: z.enum(['all', 'any']),
  rules: z.array(z.strictObject({
    component_key: keySchema,
    operator: z.enum(['equals', 'not_equals', 'contains', 'not_contains', 'is_filled', 'is_empty']),
    value: z.string().trim().min(1).max(80).optional(),
  })).min(1).max(20),
}).superRefine((condition, context) => {
  condition.rules.forEach((rule, index) => {
    const needsValue = ['equals', 'not_equals', 'contains', 'not_contains'].includes(rule.operator);
    if (needsValue !== (rule.value !== undefined)) context.addIssue({ code: 'custom', message: 'Condition rule value does not match its operator', path: ['rules', index, 'value'] });
  });
});

const optionSchema = z.strictObject({
  label: labelSchema,
  value: z.string().trim().min(1).max(80).optional(),
  image_url: z.string().trim().url().max(2048).refine((value) => new URL(value).protocol === 'https:').optional(),
  description: z.string().trim().max(500).optional(),
  condition: conditionSchema.optional(),
  x: z.number().min(0).max(100).optional(),
  y: z.number().min(0).max(100).optional(),
  width: z.number().min(1).max(100).optional(),
  height: z.number().min(1).max(100).optional(),
  rotation: z.number().min(-360).max(360).optional(),
});

const selectOptionsSchema = z.array(optionSchema).min(1).max(50)
  .refine((options) => new Set(options.map(({ label }) => label)).size === options.length)
  .refine((options) => new Set(options.map(({ value, label }) => value ?? label)).size === options.length);

export const characterSheetComponentSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...componentBaseSchema, type: z.literal('short_text') }),
  z.strictObject({ ...componentBaseSchema, type: z.literal('long_text') }),
  z.strictObject({ ...componentBaseSchema, type: z.literal('number') }),
  z.strictObject({ ...componentBaseSchema, type: z.literal('visual_composition'), composition_key: keySchema }),
  z.strictObject({
    ...componentBaseSchema,
    type: z.literal('single_select'),
    presentation: z.enum(['select', 'cards', 'canvas']),
    selection_mode: z.enum(['single', 'multiple']).optional(),
    composition_key: keySchema.optional(),
    options: selectOptionsSchema,
  }),
]);

export type CharacterSheetComponent = z.infer<typeof characterSheetComponentSchema>;

const visualElementBaseSchema = {
  key: keySchema,
  composition_key: keySchema.optional(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(1).max(100),
  height: z.number().min(1).max(100),
  rotation: z.number().min(-360).max(360),
};

const visualElementSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...visualElementBaseSchema, type: z.literal('text'), text: z.string().trim().min(1).max(500) }),
  z.strictObject({
    ...visualElementBaseSchema,
    type: z.literal('image'),
    image_url: z.string().trim().url().max(2048).refine((value) => new URL(value).protocol === 'https:'),
    description: z.string().trim().max(500).optional(),
  }),
]).refine((element) => element.x + element.width <= 100 && element.y + element.height <= 100);

export type CharacterSheetVisualElement = z.infer<typeof visualElementSchema>;

export const characterSheetStepSchema = z.strictObject({
  key: keySchema,
  label: labelSchema,
  position: z.number().int().min(0).max(19),
  components: z.array(characterSheetComponentSchema).max(50),
  elements: z.array(visualElementSchema).max(50).optional(),
});

export const characterSheetDefinitionSchema = z.strictObject({
  version: z.literal(1),
  layout_mode: z.enum(['single_page', 'step_by_step']).optional(),
  steps: z.array(characterSheetStepSchema).min(1).max(20),
}).superRefine((definition, context) => {
  const stepKeys = new Set<string>();
  const stepPositions = new Set<number>();
  const componentKeys = new Set<string>();
  const elementKeys = new Set<string>();

  const priorSelectableComponents = new Map<string, Set<string>>();
  [...definition.steps].sort((a, b) => a.position - b.position).forEach((step, stepIndex) => {
    if (stepKeys.has(step.key)) {
      context.addIssue({ code: 'custom', message: 'Step keys must be unique', path: ['steps', stepIndex, 'key'] });
    }
    if (stepPositions.has(step.position)) {
      context.addIssue({ code: 'custom', message: 'Step positions must be unique', path: ['steps', stepIndex, 'position'] });
    }
    stepKeys.add(step.key);
    stepPositions.add(step.position);

    const componentPositions = new Set<number>();
    const compositionKeys = new Set((step.elements ?? []).map((element) => element.composition_key ?? 'composition_1'));
    const linkedCompositionKeys = new Set(step.components.flatMap((component) => component.type === 'visual_composition' ? [component.composition_key] : []));
    const referencedCompositions = new Set<string>();
    [...step.components].sort((a, b) => a.position - b.position).forEach((component, componentIndex) => {
      if (componentKeys.has(component.key)) {
        context.addIssue({ code: 'custom', message: 'Component keys must be unique', path: ['steps', stepIndex, 'components', componentIndex, 'key'] });
      }
      if (componentPositions.has(component.position)) {
        context.addIssue({ code: 'custom', message: 'Component positions must be unique within a step', path: ['steps', stepIndex, 'components', componentIndex, 'position'] });
      }
      componentKeys.add(component.key);
      componentPositions.add(component.position);

      if (component.type === 'single_select') {
        if (component.presentation === 'canvas' && component.composition_key && !linkedCompositionKeys.has(component.composition_key)) {
          context.addIssue({ code: 'custom', message: 'Canvas choices must reference a composition in this step', path: ['steps', stepIndex, 'components', componentIndex, 'composition_key'] });
        }
        component.options.forEach((option, optionIndex) => {
          option.condition?.rules.forEach((rule, ruleIndex) => {
            const priorValues = priorSelectableComponents.get(rule.component_key);
            if (!priorValues || (rule.value !== undefined && !priorValues.has(rule.value))) {
              context.addIssue({ code: 'custom', message: 'Option conditions must reference an earlier choice and one of its values', path: ['steps', stepIndex, 'components', componentIndex, 'options', optionIndex, 'condition', 'rules', ruleIndex] });
            }
          });
          const layout = [option.x, option.y, option.width, option.height, option.rotation];
          const hasLayout = layout.every((value) => value !== undefined);
          const hasPartialLayout = layout.some((value) => value !== undefined) && !hasLayout;
          if (component.presentation === 'canvas' && !hasLayout) {
            context.addIssue({ code: 'custom', message: 'Canvas options require complete positioning', path: ['steps', stepIndex, 'components', componentIndex, 'options', optionIndex] });
          } else if (hasPartialLayout) {
            context.addIssue({ code: 'custom', message: 'Option positioning must include all layout values', path: ['steps', stepIndex, 'components', componentIndex, 'options', optionIndex] });
          }
          if (hasLayout && (option.x! + option.width! > 100 || option.y! + option.height! > 100)) {
            context.addIssue({ code: 'custom', message: 'Option positioning exceeds the canvas', path: ['steps', stepIndex, 'components', componentIndex, 'options', optionIndex] });
          }
        });
        priorSelectableComponents.set(component.key, new Set(component.options.map((option) => option.value ?? option.label)));
      } else if (component.type === 'visual_composition') {
        if (!compositionKeys.has(component.composition_key) || referencedCompositions.has(component.composition_key)) {
          context.addIssue({ code: 'custom', message: 'Visual composition must reference a unique composition in this step', path: ['steps', stepIndex, 'components', componentIndex, 'composition_key'] });
        }
        referencedCompositions.add(component.composition_key);
      }
    });

    step.elements?.forEach((element, elementIndex) => {
      if (elementKeys.has(element.key)) {
        context.addIssue({ code: 'custom', message: 'Visual element keys must be unique', path: ['steps', stepIndex, 'elements', elementIndex, 'key'] });
      }
      elementKeys.add(element.key);
    });

    if ([...step.components].some((component) => component.type === 'visual_composition') && step.elements?.length === 0) {
      context.addIssue({ code: 'custom', message: 'Visual composition components require visual elements', path: ['steps', stepIndex, 'elements'] });
    }
  });

  if (definition.steps.reduce((total, step) => total + step.components.length, 0) > 50) {
    context.addIssue({ code: 'custom', message: 'A character sheet cannot have more than 50 components', path: ['steps'] });
  }
  if (definition.steps.reduce((total, step) => total + (step.elements?.length ?? 0), 0) > 50) {
    context.addIssue({ code: 'custom', message: 'A character sheet cannot have more than 50 visual elements', path: ['steps'] });
  }

});

export type CharacterSheetStep = z.infer<typeof characterSheetStepSchema>;
export type CharacterSheetDefinition = z.infer<typeof characterSheetDefinitionSchema>;

const legacyFieldBaseSchema = {
  key: keySchema,
  label: labelSchema,
  required: z.boolean(),
  position: z.number().int().min(0).max(49),
  show_on_card: z.boolean(),
};

export const legacyCharacterSheetFieldSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...legacyFieldBaseSchema, type: z.literal('short_text') }),
  z.strictObject({ ...legacyFieldBaseSchema, type: z.literal('long_text') }),
  z.strictObject({ ...legacyFieldBaseSchema, type: z.literal('number') }),
  z.strictObject({ ...legacyFieldBaseSchema, type: z.literal('single_select'), options: z.array(labelSchema).min(1).max(50) }),
]);

export const legacyCharacterSheetFieldsSchema = z.array(legacyCharacterSheetFieldSchema).max(50).superRefine((fields, context) => {
  const keys = new Set<string>();
  const positions = new Set<number>();
  fields.forEach((field, index) => {
    if (keys.has(field.key)) context.addIssue({ code: 'custom', message: 'Field keys must be unique', path: [index, 'key'] });
    if (positions.has(field.position)) context.addIssue({ code: 'custom', message: 'Field positions must be unique', path: [index, 'position'] });
    keys.add(field.key);
    positions.add(field.position);
  });
});

export type LegacyCharacterSheetField = z.infer<typeof legacyCharacterSheetFieldSchema>;

export function legacyFieldsToDefinition(fields: LegacyCharacterSheetField[]): CharacterSheetDefinition {
  const components = [...fields].sort((a, b) => a.position - b.position).map((field, position) => {
    const base = { key: field.key, label: field.label, required: field.required, position, width: 'full' as const, show_on_card: field.show_on_card };
    if (field.type === 'single_select') {
      return { ...base, type: field.type, presentation: 'select' as const, options: field.options.map((label) => ({ label })) };
    }
    return { ...base, type: field.type };
  });

  return { version: 1, steps: [{ key: 'step_1', label: 'Etapa 1', position: 0, components }] };
}

export const createSystemInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(10000).nullable().optional(),
  definition: characterSheetDefinitionSchema,
  play_mode: playModesSchema,
  tags: systemTagSlugsSchema,
});

export const updateGameSystemInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(10000).nullable(),
  is_public: z.boolean(),
  password: z.string().min(8).max(72).optional(),
  play_mode: playModesSchema,
  tags: systemTagSlugsSchema,
  cover_image_path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|avif)$/i).nullable(),
  cover_focus_x: z.number().int().min(0).max(100),
  cover_focus_y: z.number().int().min(0).max(100),
});

export const createCharacterInputSchema = z.strictObject({
  character_name: z.string().trim().min(1).max(80),
  attributes: z.record(z.string(), z.unknown()),
  system_password: z.string().max(72).optional(),
});

export const systemTagOptionSchema = z.strictObject({
  slug: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
  label: z.string().trim().min(1).max(50),
});

export const storedGameSystemSchema = z.strictObject({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  is_active: z.boolean().optional(),
  is_public: z.boolean().default(true),
  cover_image_path: z.string().nullable().default(null),
  cover_focus_x: z.number().int().min(0).max(100).default(50),
  cover_focus_y: z.number().int().min(0).max(100).default(50),
  tags: z.array(z.string()).default([]),
  play_mode: playModesSchema.default(['text']),
});

export const gameSystemSchema = z.strictObject({
  ...storedGameSystemSchema.shape,
  tags: z.array(systemTagOptionSchema),
});

export const updateGameSystemResultSchema = z.strictObject({
  status: z.enum(['updated', 'not_owner', 'not_found', 'password_required', 'password_too_short', 'password_too_long', 'invalid_details']),
  system: storedGameSystemSchema.nullable(),
});

export const gameSystemLifecycleResultSchema = z.strictObject({
  status: z.enum(['archived', 'activated', 'deleted', 'not_owner', 'not_found', 'invalid_action', 'unauthorized', 'email_confirmation_required']),
  is_active: z.boolean().optional(),
});

export const joinGameSystemResultSchema = z.strictObject({ status: z.enum(['ok', 'unauthorized', 'not_found', 'password_required', 'invalid_password', 'rate_limited']) });

export const gameSystemsResponseSchema = z.strictObject({
  systems: z.array(gameSystemSchema),
});

export const systemTagOptionsResponseSchema = z.strictObject({
  tags: z.array(systemTagOptionSchema),
});

export const createGameSystemResultSchema = z.strictObject({
  status: z.literal('created'),
  system: storedGameSystemSchema,
  definition: characterSheetDefinitionSchema,
});

export const characterSheetResponseSchema = z.strictObject({
  game_system_id: z.uuid(),
  definition: characterSheetDefinitionSchema,
});

export const systemCharacterSchema = z.strictObject({
  id: z.uuid(),
  game_system_id: z.uuid(),
  character_name: z.string(),
  attributes: z.record(z.string(), z.unknown()),
  status: z.literal('active'),
});

export const systemCharactersResponseSchema = z.strictObject({
  characters: z.array(systemCharacterSchema),
});

export const createSystemCharacterResultSchema = z.strictObject({
  character: systemCharacterSchema,
});

function hasValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  return value !== undefined && value !== null;
}

function characterSheetOptionIsAvailable(option: z.infer<typeof optionSchema>, values: Record<string, unknown>): boolean {
  if (!option.condition) return true;
  const matches = option.condition.rules.map((rule) => {
    const current = values[rule.component_key];
    const filled = hasValue(current);
    if (rule.operator === 'is_filled') return filled;
    if (rule.operator === 'is_empty') return !filled;
    const equals = Array.isArray(current) ? current.includes(rule.value ?? '') : current === rule.value;
    const contains = Array.isArray(current) ? current.includes(rule.value ?? '') : typeof current === 'string' && current.includes(rule.value ?? '');
    if (rule.operator === 'equals') return equals;
    if (rule.operator === 'not_equals') return !equals;
    if (rule.operator === 'contains') return contains;
    return !contains;
  });
  return option.condition.logic === 'all' ? matches.every(Boolean) : matches.some(Boolean);
}

export function characterAttributesSchemaFor(definition: CharacterSheetDefinition) {
  const orderedSteps = [...definition.steps].sort((a, b) => a.position - b.position);
  const components = orderedSteps.flatMap((step) => step.components);

  return z.record(z.string(), z.unknown()).superRefine((attributes, context) => {
    const componentKeys = new Set(components.map((component) => component.key));
    Object.keys(attributes).forEach((key) => {
      if (!componentKeys.has(key)) context.addIssue({ code: 'custom', message: 'Unknown character attribute', path: [key] });
    });

    for (const step of orderedSteps) {
      for (const component of [...step.components].sort((a, b) => a.position - b.position)) {
        if (component.type === 'visual_composition') {
          if (Object.hasOwn(attributes, component.key)) context.addIssue({ code: 'custom', message: 'Visual composition cannot store a character attribute', path: [component.key] });
          continue;
        }
        const visibleOptions = component.type === 'single_select' ? component.options.filter((option) => characterSheetOptionIsAvailable(option, attributes)) : null;
        if (!Object.hasOwn(attributes, component.key)) {
          if (component.required && (visibleOptions === null || visibleOptions.length > 0)) context.addIssue({ code: 'custom', message: 'Required character attribute is missing', path: [component.key] });
          continue;
        }

        const value = attributes[component.key];
        if (!component.required && !hasValue(value)) continue;

        if (component.type === 'short_text' || component.type === 'long_text') {
          if (typeof value !== 'string' || (component.required && value.trim().length === 0)) {
            context.addIssue({ code: 'custom', message: 'Character attribute must be nonblank text', path: [component.key] });
          }
          continue;
        }

        if (component.type === 'number') {
          if (typeof value !== 'number' || !Number.isFinite(value)) {
            context.addIssue({ code: 'custom', message: 'Character attribute must be a finite number', path: [component.key] });
          }
          continue;
        }

        const allowedValues = new Set(visibleOptions!.map((option) => option.value ?? option.label));
        if (component.selection_mode === 'multiple') {
          if (!Array.isArray(value) || value.some((selected) => typeof selected !== 'string' || !allowedValues.has(selected)) || new Set(value).size !== value.length || (component.required && value.length === 0)) {
            context.addIssue({ code: 'custom', message: 'Character attribute must match configured options', path: [component.key] });
          }
        } else if (typeof value !== 'string' || !allowedValues.has(value)) {
          context.addIssue({ code: 'custom', message: 'Character attribute must match a configured option', path: [component.key] });
        }
      }
    }
  }).transform((attributes) => {
    const normalized: Record<string, unknown> = {};
    for (const step of orderedSteps) {
      for (const component of [...step.components].sort((a, b) => a.position - b.position)) {
        if (component.type === 'visual_composition') continue;
        const value = attributes[component.key];
        if (value === undefined || value === null) continue;
        if (typeof value === 'string') {
          const trimmed = value.trim();
          if (!trimmed) continue;
          normalized[component.key] = trimmed;
        } else if (Array.isArray(value)) {
          const allowedValues = new Set(component.type === 'single_select' ? component.options.map((option) => option.value ?? option.label) : []);
          const selected = [...new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0 && allowedValues.has(item)))];
          if (selected.length > 0) normalized[component.key] = selected;
        } else {
          normalized[component.key] = value;
        }
      }
    }
    return normalized;
  });
}

export type CreateSystemInput = z.infer<typeof createSystemInputSchema>;
export type UpdateGameSystemInput = z.infer<typeof updateGameSystemInputSchema>;
export type CreateCharacterInput = z.infer<typeof createCharacterInputSchema>;
export type GameSystem = z.infer<typeof gameSystemSchema>;
export type SystemCharacter = z.infer<typeof systemCharacterSchema>;
