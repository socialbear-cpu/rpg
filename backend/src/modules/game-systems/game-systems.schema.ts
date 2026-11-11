import { z } from 'zod';

const fieldBaseSchema = {
  key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  label: z.string().trim().min(1).max(80),
  required: z.boolean(),
  position: z.number().int().min(0).max(49),
  show_on_card: z.boolean(),
};

const selectOptionsSchema = z.array(z.string().trim().min(1).max(80)).min(1).max(50)
  .refine((options) => new Set(options).size === options.length);

export const characterSheetFieldSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...fieldBaseSchema, type: z.literal('short_text') }),
  z.strictObject({ ...fieldBaseSchema, type: z.literal('long_text') }),
  z.strictObject({ ...fieldBaseSchema, type: z.literal('number') }),
  z.strictObject({ ...fieldBaseSchema, type: z.literal('single_select'), options: selectOptionsSchema }),
]);

export type CharacterSheetField = z.infer<typeof characterSheetFieldSchema>;

export const characterSheetFieldsSchema = z.array(characterSheetFieldSchema).max(50).superRefine((fields, context) => {
  const keys = new Set<string>();
  const positions = new Set<number>();
  fields.forEach((field, index) => {
    if (keys.has(field.key)) {
      context.addIssue({ code: 'custom', message: 'Field keys must be unique', path: [index, 'key'] });
    }
    if (positions.has(field.position)) {
      context.addIssue({ code: 'custom', message: 'Field positions must be unique', path: [index, 'position'] });
    }
    keys.add(field.key);
    positions.add(field.position);
  });
});

export const createSystemInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  fields: characterSheetFieldsSchema,
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
  fields: characterSheetFieldsSchema,
});

export const characterSheetResponseSchema = z.strictObject({
  game_system_id: z.uuid(),
  fields: characterSheetFieldsSchema,
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

export function characterAttributesSchemaFor(fields: CharacterSheetField[]) {
  return z.record(z.string(), z.unknown()).superRefine((attributes, context) => {
    const fieldKeys = new Set(fields.map((field) => field.key));
    Object.keys(attributes).forEach((key) => {
      if (!fieldKeys.has(key)) {
        context.addIssue({ code: 'custom', message: 'Unknown character attribute', path: [key] });
      }
    });

    fields.forEach((field) => {
      if (!Object.hasOwn(attributes, field.key)) {
        if (field.required) {
          context.addIssue({ code: 'custom', message: 'Required character attribute is missing', path: [field.key] });
        }
        return;
      }

      const value = attributes[field.key];
      if (!field.required && (value === '' || value === null || value === undefined)) return;

      if (field.type === 'short_text' || field.type === 'long_text') {
        if (typeof value !== 'string' || (field.required && value.trim().length === 0)) {
          context.addIssue({ code: 'custom', message: 'Character attribute must be nonblank text', path: [field.key] });
        }
        return;
      }

      if (field.type === 'number') {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          context.addIssue({ code: 'custom', message: 'Character attribute must be a finite number', path: [field.key] });
        }
        return;
      }

      if (typeof value !== 'string' || !field.options.includes(value)) {
        context.addIssue({ code: 'custom', message: 'Character attribute must match a configured option', path: [field.key] });
      }
    });
  }).transform((attributes) => {
    const normalized: Record<string, unknown> = {};
    for (const field of fields) {
      const value = attributes[field.key];
      if (value === undefined || value === null) continue;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) continue;
        normalized[field.key] = trimmed;
      } else {
        normalized[field.key] = value;
      }
    }
    return normalized;
  });
}

export type CreateSystemInput = z.infer<typeof createSystemInputSchema>;
export type CreateCharacterInput = z.infer<typeof createCharacterInputSchema>;
export type GameSystem = z.infer<typeof gameSystemSchema>;
export type SystemCharacter = z.infer<typeof systemCharacterSchema>;
