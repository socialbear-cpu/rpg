import type { CharacterSheetOption } from '../../api';

export function getCharacterSheetOptionLayout(option: CharacterSheetOption, index: number, count: number) {
  const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.ceil(count / columns);
  const width = option.width ?? 90 / columns;
  const height = option.height ?? 80 / rows;
  return {
    x: option.x ?? 5 + (index % columns) * (width + 2),
    y: option.y ?? 5 + Math.floor(index / columns) * (height + 2),
    width,
    height,
  };
}
