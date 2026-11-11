import { describe, expect, it } from 'vitest';
import {
  characterAttributesSchemaFor,
  characterSheetFieldsSchema,
  createCharacterInputSchema,
  createSystemInputSchema,
} from '../src/modules/game-systems/game-systems.schema.js';
import type { CharacterSheetField } from '../src/modules/game-systems/game-systems.schema.js';

const allFieldTypes: CharacterSheetField[] = [
  { key: 'origin', label: 'Origem', type: 'short_text', required: true, position: 0, show_on_card: true },
  { key: 'history', label: 'História', type: 'long_text', required: false, position: 1, show_on_card: false },
  { key: 'power', label: 'Poder', type: 'number', required: true, position: 2, show_on_card: true },
  { key: 'class', label: 'Classe', type: 'single_select', required: true, position: 3, show_on_card: true, options: ['Guerreiro', 'Mago'] },
];

describe('game system character-sheet schemas', () => {
  it('accepts all configured field types and returns them in submitted order', () => {
    const parsed = characterSheetFieldsSchema.safeParse(allFieldTypes);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual(allFieldTypes);
  });

  it('rejects duplicate keys and positions', () => {
    const duplicateKey = [{ ...allFieldTypes[0] }, { ...allFieldTypes[1], key: 'origin' }];
    const duplicatePosition = [{ ...allFieldTypes[0] }, { ...allFieldTypes[1], position: 0 }];
    expect(characterSheetFieldsSchema.safeParse(duplicateKey).success).toBe(false);
    expect(characterSheetFieldsSchema.safeParse(duplicatePosition).success).toBe(false);
  });

  it('rejects malformed single-select definitions and options on other field types', () => {
    const noOptions = [{ ...allFieldTypes[3], options: [] }];
    const duplicateOptions = [{ ...allFieldTypes[3], options: ['Mago', 'Mago'] }];
    const textWithOptions = [{ ...allFieldTypes[0], options: ['A'] }];
    expect(characterSheetFieldsSchema.safeParse(noOptions).success).toBe(false);
    expect(characterSheetFieldsSchema.safeParse(duplicateOptions).success).toBe(false);
    expect(characterSheetFieldsSchema.safeParse(textWithOptions).success).toBe(false);
  });

  it('rejects unknown properties and unsupported field types', () => {
    expect(characterSheetFieldsSchema.safeParse([{ ...allFieldTypes[0], custom: true }]).success).toBe(false);
    expect(characterSheetFieldsSchema.safeParse([{ ...allFieldTypes[0], type: 'checkbox' }]).success).toBe(false);
  });
});

describe('system and character input schemas', () => {
  it('trims and bounds system and character names while accepting optional description', () => {
    expect(createSystemInputSchema.safeParse({ name: '  Meu Sistema  ', fields: [] }).success).toBe(true);
    expect(createSystemInputSchema.safeParse({ name: '  ', fields: [] }).success).toBe(false);
    expect(createSystemInputSchema.safeParse({ name: 'A'.repeat(81), fields: [] }).success).toBe(false);
    expect(createCharacterInputSchema.safeParse({ character_name: '  Liora  ', attributes: {} }).success).toBe(true);
    expect(createCharacterInputSchema.safeParse({ character_name: '  ', attributes: {} }).success).toBe(false);
  });
});

describe('character attributes against a system sheet', () => {
  it('normalizes supplied values and omits blank optional fields', () => {
    const result = characterAttributesSchemaFor([...allFieldTypes]).safeParse({
      origin: '  Floresta  ', history: '  ', power: 12, class: 'Mago',
    });
    expect(result).toEqual({
      success: true,
      data: { origin: 'Floresta', power: 12, class: 'Mago' },
    });
  });

  it('rejects missing required values, wrong types, invalid options, and undeclared keys', () => {
    const schema = characterAttributesSchemaFor([...allFieldTypes]);
    expect(schema.safeParse({ power: 12, class: 'Mago' }).success).toBe(false);
    expect(schema.safeParse({ origin: 'Cidade', power: '12', class: 'Mago' }).success).toBe(false);
    expect(schema.safeParse({ origin: 'Cidade', power: 12, class: 'Ladino' }).success).toBe(false);
    expect(schema.safeParse({ origin: 'Cidade', power: 12, class: 'Mago', extra: 'value' }).success).toBe(false);
  });
});
