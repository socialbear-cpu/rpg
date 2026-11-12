import { describe, expect, it } from 'vitest';
import {
  characterAttributesSchemaFor,
  characterSheetDefinitionSchema,
  createCharacterInputSchema,
  createSystemInputSchema,
  legacyFieldsToDefinition,
} from '../src/modules/game-systems/game-systems.schema.js';
import type { CharacterSheetComponent, CharacterSheetDefinition, LegacyCharacterSheetField } from '../src/modules/game-systems/game-systems.schema.js';

const allComponents: CharacterSheetComponent[] = [
  { key: 'origin', label: 'Origem', type: 'short_text', required: true, position: 0, width: 'full', show_on_card: true },
  { key: 'history', label: 'História', type: 'long_text', required: false, position: 1, width: 'full', show_on_card: false },
  { key: 'power', label: 'Poder', type: 'number', required: true, position: 2, width: 'half', show_on_card: true },
  { key: 'class', label: 'Classe', type: 'single_select', required: true, position: 0, width: 'full', show_on_card: true, presentation: 'select', options: [{ label: 'Guerreiro' }, { label: 'Mago' }] },
  { key: 'village', label: 'Vila', type: 'single_select', required: true, position: 1, width: 'full', show_on_card: false, presentation: 'cards', options: [{ label: 'Folha', image_url: 'https://cdn.example/folha.jpg', description: 'Uma vila escondida entre árvores.' }, { label: 'Areia' }] },
];

const definition: CharacterSheetDefinition = {
  version: 1,
  steps: [
    { key: 'identity', label: 'Identidade', position: 0, components: allComponents.slice(0, 3) },
    { key: 'origin_step', label: 'Origem', position: 1, components: allComponents.slice(3) },
  ],
};

const legacyFields: LegacyCharacterSheetField[] = [
  { key: 'class', label: 'Classe', type: 'single_select', required: true, position: 0, show_on_card: true, options: ['Guerreiro', 'Mago'] },
  { key: 'history', label: 'História', type: 'long_text', required: false, position: 1, show_on_card: false },
];

describe('versioned character-sheet definitions', () => {
  it('accepts fields arranged across steps, including visual select cards', () => {
    expect(characterSheetDefinitionSchema.safeParse(definition)).toEqual({ success: true, data: definition });
  });

  it('rejects duplicate component keys and step positions', () => {
    const duplicateKey = structuredClone(definition);
    duplicateKey.steps[1]!.components[0]!.key = 'origin';
    const duplicateStepPosition = structuredClone(definition);
    duplicateStepPosition.steps[1]!.position = 0;
    expect(characterSheetDefinitionSchema.safeParse(duplicateKey).success).toBe(false);
    expect(characterSheetDefinitionSchema.safeParse(duplicateStepPosition).success).toBe(false);
  });

  it('rejects invalid image URLs, duplicate option labels, and oversized descriptions', () => {
    const invalidScheme = structuredClone(definition);
    const invalidSchemeVillage = invalidScheme.steps[1]!.components[1]!;
    if (invalidSchemeVillage.type !== 'single_select') throw new Error('Expected select component');
    invalidSchemeVillage.options[0]!.image_url = 'http://cdn.example/folha.jpg';
    const duplicateOption = structuredClone(definition);
    const duplicateVillage = duplicateOption.steps[1]!.components[1]!;
    if (duplicateVillage.type !== 'single_select') throw new Error('Expected select component');
    duplicateVillage.options[1]!.label = 'Folha';
    const longDescription = structuredClone(definition);
    const longDescriptionVillage = longDescription.steps[1]!.components[1]!;
    if (longDescriptionVillage.type !== 'single_select') throw new Error('Expected select component');
    longDescriptionVillage.options[0]!.description = 'x'.repeat(501);
    expect(characterSheetDefinitionSchema.safeParse(invalidScheme).success).toBe(false);
    expect(characterSheetDefinitionSchema.safeParse(duplicateOption).success).toBe(false);
    expect(characterSheetDefinitionSchema.safeParse(longDescription).success).toBe(false);
  });

  it('accepts positioned visual elements and rejects unsafe or out-of-bounds images', () => {
    const withVisuals = structuredClone(definition);
    withVisuals.steps[0]!.elements = [
      { key: 'title', type: 'text', text: 'Ficha de Ayla', x: 5, y: 8, width: 35, height: 12, rotation: -5 },
      { key: 'portrait', type: 'image', image_url: 'https://cdn.example/ayla.jpg', description: 'Retrato de Ayla', x: 60, y: 5, width: 30, height: 40, rotation: 12 },
    ];
    expect(characterSheetDefinitionSchema.safeParse(withVisuals).success).toBe(true);

    const unsafeImage = structuredClone(withVisuals);
    const unsafeImageElement = unsafeImage.steps[0]!.elements![1]!;
    if (unsafeImageElement.type !== 'image') throw new Error('Expected image element');
    unsafeImageElement.image_url = 'http://cdn.example/ayla.jpg';
    const outOfBounds = structuredClone(withVisuals);
    outOfBounds.steps[0]!.elements![1]!.x = 80;
    expect(characterSheetDefinitionSchema.safeParse(unsafeImage).success).toBe(false);
    expect(characterSheetDefinitionSchema.safeParse(outOfBounds).success).toBe(false);
  });

  it('accepts positioned multi-select choices and conditions that reference earlier components', () => {
    const interactive: CharacterSheetDefinition = {
      version: 1,
      steps: [
        {
          key: 'origin_step',
          label: 'Origem',
          position: 0,
          components: [{
            key: 'origin',
            label: 'Origem',
            type: 'single_select',
            required: true,
            position: 0,
            width: 'full',
            show_on_card: true,
            presentation: 'select',
            options: [{ label: 'Cidade', value: 'city' }, { label: 'Floresta', value: 'forest' }],
          }],
        },
        {
          key: 'details',
          label: 'Detalhes',
          position: 1,
          condition: { logic: 'any', rules: [
            { component_key: 'origin', operator: 'equals', value: 'city' },
            { component_key: 'origin', operator: 'equals', value: 'forest' },
          ] },
          components: [{
            key: 'interests',
            label: 'Interesses',
            type: 'single_select',
            required: true,
            position: 0,
            width: 'full',
            show_on_card: false,
            presentation: 'canvas',
            selection_mode: 'multiple',
            options: [
              { label: 'Explorar', value: 'explore', image_url: 'https://cdn.example/explore.jpg', x: 5, y: 5, width: 40, height: 45, rotation: -5, condition: { logic: 'all', rules: [{ component_key: 'origin', operator: 'is_filled' }] } },
              { label: 'Estudar', value: 'study', image_url: 'https://cdn.example/study.jpg', x: 55, y: 5, width: 40, height: 45, rotation: 0 },
            ],
          }],
        },
      ],
    };
    expect(characterSheetDefinitionSchema.safeParse(interactive).success).toBe(true);

    const futureReference = structuredClone(interactive);
    futureReference.steps[0]!.condition = { logic: 'all', rules: [{ component_key: 'origin', operator: 'is_filled' }] };
    expect(characterSheetDefinitionSchema.safeParse(futureReference).success).toBe(false);

    const partialLayout = structuredClone(interactive);
    const interests = partialLayout.steps[1]!.components[0]!;
    if (interests.type !== 'single_select') throw new Error('Expected select component');
    delete interests.options[0]!.rotation;
    expect(characterSheetDefinitionSchema.safeParse(partialLayout).success).toBe(false);
  });

  it('converts legacy fields into a single step and defaults selects to the native menu', () => {
    expect(legacyFieldsToDefinition(legacyFields)).toEqual({
      version: 1,
      steps: [{
        key: 'step_1', label: 'Etapa 1', position: 0,
        components: [
          { key: 'class', label: 'Classe', type: 'single_select', required: true, position: 0, width: 'full', show_on_card: true, presentation: 'select', options: [{ label: 'Guerreiro' }, { label: 'Mago' }] },
          { key: 'history', label: 'História', type: 'long_text', required: false, position: 1, width: 'full', show_on_card: false },
        ],
      }],
    });
  });
});

describe('system and character input schemas', () => {
  it('trims and bounds system and character names while accepting an optional description', () => {
    expect(createSystemInputSchema.safeParse({ name: '  Meu Sistema  ', definition }).success).toBe(true);
    expect(createSystemInputSchema.safeParse({ name: '  ', definition }).success).toBe(false);
    expect(createSystemInputSchema.safeParse({ name: 'A'.repeat(81), definition }).success).toBe(false);
    expect(createCharacterInputSchema.safeParse({ character_name: '  Liora  ', attributes: {} }).success).toBe(true);
    expect(createCharacterInputSchema.safeParse({ character_name: '  ', attributes: {} }).success).toBe(false);
  });
});

describe('character attributes against a system sheet', () => {
  it('normalizes submitted values and omits blank optional fields across steps', () => {
    const result = characterAttributesSchemaFor(definition).safeParse({
      origin: '  Floresta  ', history: '  ', power: 12, class: 'Mago', village: 'Folha',
    });
    expect(result).toEqual({
      success: true,
      data: { origin: 'Floresta', power: 12, class: 'Mago', village: 'Folha' },
    });
  });

  it('rejects missing required values, wrong types, invalid options, and undeclared keys', () => {
    const schema = characterAttributesSchemaFor(definition);
    expect(schema.safeParse({ power: 12, class: 'Mago', village: 'Folha' }).success).toBe(false);
    expect(schema.safeParse({ origin: 'Cidade', power: '12', class: 'Mago', village: 'Folha' }).success).toBe(false);
    expect(schema.safeParse({ origin: 'Cidade', power: 12, class: 'Ladino', village: 'Folha' }).success).toBe(false);
    expect(schema.safeParse({ origin: 'Cidade', power: 12, class: 'Mago', village: 'Nevoa' }).success).toBe(false);
    expect(schema.safeParse({ origin: 'Cidade', power: 12, class: 'Mago', village: 'Folha', extra: true }).success).toBe(false);
  });

  it('validates conditional multi-select choices against only currently visible answers', () => {
    const conditionalDefinition: CharacterSheetDefinition = {
      version: 1,
      steps: [
        {
          key: 'origin',
          label: 'Origem',
          position: 0,
          components: [{
            key: 'path',
            label: 'Caminho',
            type: 'single_select',
            required: true,
            position: 0,
            width: 'full',
            show_on_card: false,
            presentation: 'select',
            options: [{ label: 'Cidade', value: 'city' }, { label: 'Floresta', value: 'forest' }],
          }],
        },
        {
          key: 'city_details',
          label: 'Cidade',
          position: 1,
          condition: { logic: 'all', rules: [{ component_key: 'path', operator: 'equals', value: 'city' }] },
          components: [
            { key: 'city_name', label: 'Cidade', type: 'short_text', required: true, position: 0, width: 'full', show_on_card: false },
            {
              key: 'interests',
              label: 'Interesses',
              type: 'single_select',
              required: true,
              position: 1,
              width: 'full',
              show_on_card: false,
              presentation: 'cards',
              selection_mode: 'multiple',
              options: [
                { label: 'Mapas', value: 'maps', condition: { logic: 'all', rules: [{ component_key: 'city_name', operator: 'equals', value: 'Metro' }] } },
                { label: 'Guildas', value: 'guilds' },
              ],
            },
          ],
        },
        {
          key: 'outcome',
          label: 'Resultado',
          position: 2,
          condition: { logic: 'any', rules: [
            { component_key: 'city_name', operator: 'equals', value: 'Metro' },
            { component_key: 'path', operator: 'equals', value: 'forest' },
          ] },
          components: [{ key: 'trait', label: 'Traço', type: 'short_text', required: true, position: 0, width: 'full', show_on_card: false }],
        },
      ],
    };
    const schema = characterAttributesSchemaFor(conditionalDefinition);
    expect(schema.parse({ path: 'city', city_name: 'Metro', interests: ['maps', 'guilds'], trait: 'Curioso' })).toEqual({
      path: 'city', city_name: 'Metro', interests: ['maps', 'guilds'], trait: 'Curioso',
    });
    expect(schema.safeParse({ path: 'city', city_name: 'Metro', interests: ['maps', 'maps'], trait: 'Curioso' }).success).toBe(false);
    expect(schema.safeParse({ path: 'city', city_name: 'Metro', interests: ['unknown'], trait: 'Curioso' }).success).toBe(false);
    expect(schema.parse({ path: 'forest', city_name: 'valor obsoleto', interests: ['maps'], trait: 'Livre' })).toEqual({
      path: 'forest', trait: 'Livre',
    });
    expect(schema.safeParse({ path: 'city', interests: ['guilds'], trait: 'Curioso' }).success).toBe(false);
  });
});
