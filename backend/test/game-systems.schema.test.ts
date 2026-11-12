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
});
