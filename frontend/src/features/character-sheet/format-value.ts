import type { CharacterSheetField } from '../../api';

export function formatCharacterSheetValue(field: CharacterSheetField, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (field.type === 'single_select') {
    const selected = Array.isArray(value) ? value : [value];
    return selected
      .map((item) => typeof item === 'string' ? field.option_labels?.[item] ?? item : String(item))
      .join(', ') || '—';
  }
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
