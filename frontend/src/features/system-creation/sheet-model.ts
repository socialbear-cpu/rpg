import type { CharacterSheetField } from '../../api';

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

export function isCharacterSheetDefinitionValid(fields: CharacterSheetField[]): boolean {
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
