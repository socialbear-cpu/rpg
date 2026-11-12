import { z } from 'zod';

const keySchema = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);
const labelSchema = z.string().trim().min(1).max(80);

const componentBaseSchema = {
  key: keySchema,
  label: labelSchema,
  required: z.boolean(),
  position: z.number().int().min(0).max(49),
  width: z.enum(['full', 'half', 'third']),
  show_on_card: z.boolean(),
};

const optionSchema = z.strictObject({
  label: labelSchema,
  image_url: z.string().trim().url().max(2048).refine((value) => new URL(value).protocol === 'https:').optional(),
  description: z.string().trim().max(500).optional(),
});

const selectOptionsSchema = z.array(optionSchema).min(1).max(50)
  .refine((options) => new Set(options.map(({ label }) => label)).size === options.length);

export const characterSheetComponentSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...componentBaseSchema, type: z.literal('short_text') }),
  z.strictObject({ ...componentBaseSchema, type: z.literal('long_text') }),
  z.strictObject({ ...componentBaseSchema, type: z.literal('number') }),
  z.strictObject({
    ...componentBaseSchema,
    type: z.literal('single_select'),
    presentation: z.enum(['select', 'cards']),
    options: selectOptionsSchema,
  }),
]);

export type CharacterSheetComponent = z.infer<typeof characterSheetComponentSchema>;

const visualElementBaseSchema = {
  key: keySchema,
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
  steps: z.array(characterSheetStepSchema).min(1).max(20),
}).superRefine((definition, context) => {
  const stepKeys = new Set<string>();
  const stepPositions = new Set<number>();
  const componentKeys = new Set<string>();
  const elementKeys = new Set<string>();

  definition.steps.forEach((step, stepIndex) => {
    if (stepKeys.has(step.key)) {
      context.addIssue({ code: 'custom', message: 'Step keys must be unique', path: ['steps', stepIndex, 'key'] });
    }
    if (stepPositions.has(step.position)) {
      context.addIssue({ code: 'custom', message: 'Step positions must be unique', path: ['steps', stepIndex, 'position'] });
    }
    stepKeys.add(step.key);
    stepPositions.add(step.position);

    const componentPositions = new Set<number>();
    step.components.forEach((component, componentIndex) => {
      if (componentKeys.has(component.key)) {
        context.addIssue({ code: 'custom', message: 'Component keys must be unique', path: ['steps', stepIndex, 'components', componentIndex, 'key'] });
      }
      if (componentPositions.has(component.position)) {
        context.addIssue({ code: 'custom', message: 'Component positions must be unique within a step', path: ['steps', stepIndex, 'components', componentIndex, 'position'] });
      }
      componentKeys.add(component.key);
      componentPositions.add(component.position);
    });

    step.elements?.forEach((element, elementIndex) => {
      if (elementKeys.has(element.key)) {
        context.addIssue({ code: 'custom', message: 'Visual element keys must be unique', path: ['steps', stepIndex, 'elements', elementIndex, 'key'] });
      }
      elementKeys.add(element.key);
    });
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
  description: z.string().trim().max(500).nullable().optional(),
  definition: characterSheetDefinitionSchema,
});

export const createCharacterInputSchema = z.strictObject({
  character_name: z.string().trim().min(1).max(80),
  attributes: z.record(z.string(), z.unknown()),
});

export const gameSystemSchema = z.strictObject({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
});

export const gameSystemsResponseSchema = z.strictObject({
  systems: z.array(gameSystemSchema),
});

export const createGameSystemResultSchema = z.strictObject({
  status: z.literal('created'),
  system: gameSystemSchema,
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

export function characterAttributesSchemaFor(definition: CharacterSheetDefinition) {
  const components = definition.steps.flatMap((step) => step.components);

  return z.record(z.string(), z.unknown()).superRefine((attributes, context) => {
    const componentKeys = new Set(components.map((component) => component.key));
    Object.keys(attributes).forEach((key) => {
      if (!componentKeys.has(key)) context.addIssue({ code: 'custom', message: 'Unknown character attribute', path: [key] });
    });

    components.forEach((component) => {
      if (!Object.hasOwn(attributes, component.key)) {
        if (component.required) context.addIssue({ code: 'custom', message: 'Required character attribute is missing', path: [component.key] });
        return;
      }

      const value = attributes[component.key];
      if (!component.required && (value === '' || value === null || value === undefined)) return;

      if (component.type === 'short_text' || component.type === 'long_text') {
        if (typeof value !== 'string' || (component.required && value.trim().length === 0)) {
          context.addIssue({ code: 'custom', message: 'Character attribute must be nonblank text', path: [component.key] });
        }
        return;
      }

      if (component.type === 'number') {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          context.addIssue({ code: 'custom', message: 'Character attribute must be a finite number', path: [component.key] });
        }
        return;
      }

      if (typeof value !== 'string' || !component.options.some((option) => option.label === value)) {
        context.addIssue({ code: 'custom', message: 'Character attribute must match a configured option', path: [component.key] });
      }
    });
  }).transform((attributes) => {
    const normalized: Record<string, unknown> = {};
    for (const component of components) {
      const value = attributes[component.key];
      if (value === undefined || value === null) continue;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) continue;
        normalized[component.key] = trimmed;
      } else {
        normalized[component.key] = value;
      }
    }
    return normalized;
  });
}

export type CreateSystemInput = z.infer<typeof createSystemInputSchema>;
export type CreateCharacterInput = z.infer<typeof createCharacterInputSchema>;
export type GameSystem = z.infer<typeof gameSystemSchema>;
export type SystemCharacter = z.infer<typeof systemCharacterSchema>;
