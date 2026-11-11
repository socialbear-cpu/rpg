import { z } from 'zod';

export const experienceSourceTypeSchema = z.enum(['daily_login', 'mission', 'fight', 'custom']);

export const experienceSourceSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().min(1).max(80),
  source_type: experienceSourceTypeSchema,
  award_amount: z.number().int().min(0).max(1_000_000),
  is_enabled: z.boolean(),
}).refine((source) => !source.is_enabled || source.award_amount > 0);

export const experienceSettingsSchema = z.strictObject({
  game_system_id: z.uuid(),
  xp_per_level: z.number().int().min(1).max(1_000_000),
  sources: z.array(experienceSourceSchema),
});

export const experienceSourceInputSchema = z.strictObject({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(80),
  source_type: experienceSourceTypeSchema,
  award_amount: z.number().int().min(0).max(1_000_000),
  is_enabled: z.boolean(),
}).refine((source) => !source.is_enabled || source.award_amount > 0);

export const experienceSettingsInputSchema = z.strictObject({
  xp_per_level: z.number().int().min(1).max(1_000_000),
  sources: z.array(experienceSourceInputSchema).min(3),
}).superRefine(({ sources }, context) => {
  for (const sourceType of ['daily_login', 'mission', 'fight'] as const) {
    if (sources.filter((source) => source.source_type === sourceType).length !== 1) {
      context.addIssue({ code: 'custom', message: `Configure exactly one ${sourceType} source`, path: ['sources'] });
    }
  }
  const customNames = sources.filter((source) => source.source_type === 'custom').map((source) => source.name.toLocaleLowerCase());
  if (new Set(customNames).size !== customNames.length) {
    context.addIssue({ code: 'custom', message: 'Custom source names must be unique', path: ['sources'] });
  }
  const ids = sources.flatMap((source) => source.id ? [source.id] : []);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: 'custom', message: 'Source IDs must be unique', path: ['sources'] });
  }
});

export const experienceSettingsResultSchema = z.union([
  experienceSettingsSchema,
  z.strictObject({ status: z.literal('not_owner') }),
]);

export const experienceSettingsUpdateResultSchema = z.strictObject({
  status: z.enum(['updated', 'not_owner', 'invalid_settings', 'unauthorized']),
});

export const experienceHistoryItemSchema = z.strictObject({
  id: z.uuid(),
  source_type: experienceSourceTypeSchema,
  source_name: z.string(),
  amount: z.number().int().positive(),
  created_at: z.iso.datetime(),
});

export const characterExperienceSummarySchema = z.strictObject({
  character_id: z.uuid(),
  game_system_id: z.uuid(),
  total_xp: z.number().int().nonnegative(),
  level: z.number().int().min(1),
  xp_in_level: z.number().int().nonnegative(),
  xp_to_next_level: z.number().int().positive(),
  history: z.array(experienceHistoryItemSchema).max(50),
});

export type ExperienceSourceType = z.infer<typeof experienceSourceTypeSchema>;
export type ExperienceSource = z.infer<typeof experienceSourceSchema>;
export type ExperienceSourceInput = z.infer<typeof experienceSourceInputSchema>;
export type ExperienceSettings = z.infer<typeof experienceSettingsSchema>;
export type ExperienceSettingsInput = z.infer<typeof experienceSettingsInputSchema>;
export type CharacterExperienceSummary = z.infer<typeof characterExperienceSummarySchema>;
export type ExperienceSettingsUpdateResult = z.infer<typeof experienceSettingsUpdateResultSchema>;

export const experienceSettingsResponseSchema = {
  type: 'object', required: ['game_system_id', 'xp_per_level', 'sources'], additionalProperties: false,
  properties: {
    game_system_id: { type: 'string', format: 'uuid' },
    xp_per_level: { type: 'integer', minimum: 1, maximum: 1_000_000 },
    sources: { type: 'array', items: {
      type: 'object', required: ['id', 'name', 'source_type', 'award_amount', 'is_enabled'], additionalProperties: false,
      properties: {
        id: { type: 'string', format: 'uuid' }, name: { type: 'string' },
        source_type: { type: 'string', enum: ['daily_login', 'mission', 'fight', 'custom'] },
        award_amount: { type: 'integer', minimum: 0, maximum: 1_000_000 }, is_enabled: { type: 'boolean' },
      },
    } },
  },
} as const;

export const characterExperienceSummaryResponseSchema = {
  type: 'object', required: ['character_id', 'game_system_id', 'total_xp', 'level', 'xp_in_level', 'xp_to_next_level', 'history'], additionalProperties: false,
  properties: {
    character_id: { type: 'string', format: 'uuid' }, game_system_id: { type: 'string', format: 'uuid' },
    total_xp: { type: 'integer', minimum: 0 }, level: { type: 'integer', minimum: 1 },
    xp_in_level: { type: 'integer', minimum: 0 }, xp_to_next_level: { type: 'integer', minimum: 1 },
    history: { type: 'array', maxItems: 50, items: {
      type: 'object', required: ['id', 'source_type', 'source_name', 'amount', 'created_at'], additionalProperties: false,
      properties: {
        id: { type: 'string', format: 'uuid' }, source_type: { type: 'string', enum: ['daily_login', 'mission', 'fight', 'custom'] },
        source_name: { type: 'string' }, amount: { type: 'integer', minimum: 1 }, created_at: { type: 'string', format: 'date-time' },
      },
    } },
  },
} as const;

export const experienceSettingsInputOpenApiSchema = {
  type: 'object', required: ['xp_per_level', 'sources'], additionalProperties: false,
  properties: {
    xp_per_level: { type: 'integer', minimum: 1, maximum: 1_000_000 },
    sources: { type: 'array', minItems: 3, items: {
      type: 'object', required: ['name', 'source_type', 'award_amount', 'is_enabled'], additionalProperties: false,
      properties: {
        id: { type: 'string', format: 'uuid' }, name: { type: 'string', minLength: 1, maxLength: 80 },
        source_type: { type: 'string', enum: ['daily_login', 'mission', 'fight', 'custom'] },
        award_amount: { type: 'integer', minimum: 0, maximum: 1_000_000 }, is_enabled: { type: 'boolean' },
      },
    } },
  },
} as const;
