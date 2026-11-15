import { z } from 'zod';

export const lobbySectionIds = ['system-presentation', 'matchmaking', 'store', 'chat', 'events', 'character-sheet'] as const;
const lobbySectionIdSchema = z.enum(lobbySectionIds);

export const lobbySettingsSchema = z.strictObject({
  section_order: z.array(lobbySectionIdSchema).length(lobbySectionIds.length)
    .refine((sections) => new Set(sections).size === lobbySectionIds.length, 'Sections must not repeat'),
  hidden_sections: z.array(lobbySectionIdSchema),
  welcome_title: z.string().trim().min(1).max(80),
  welcome_message: z.string().trim().max(240),
  accent_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
}).refine((settings) => new Set(settings.hidden_sections).size === settings.hidden_sections.length, {
  message: 'Hidden sections must not repeat', path: ['hidden_sections'],
}).refine((settings) => settings.hidden_sections.every((section) => settings.section_order.includes(section)), {
  message: 'Hidden sections must be in the section order', path: ['hidden_sections'],
}).transform((settings) => ({ ...settings, accent_color: settings.accent_color.toUpperCase() }));

export const lobbySettingsDefaults = {
  section_order: [...lobbySectionIds],
  hidden_sections: [] as (typeof lobbySectionIds)[number][],
  welcome_title: 'Bem-vindo à aventura',
  welcome_message: 'Escolha onde sua próxima história começa.',
  accent_color: '#8B5CF6',
};

export type LobbySettings = typeof lobbySettingsDefaults;
