import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { CharacterSheetField } from '../src/api.js';
import {
  addSheetField,
  isCharacterSheetDefinitionValid,
  moveSheetField,
  removeSheetField,
} from '../src/features/system-creation/sheet-model.js';
import { CharacterSheetBuilder } from '../src/features/system-creation/character-sheet-builder.js';
import { SystemsSection } from '../src/features/dashboard/systems-section.js';
import { SystemCreationWizard } from '../src/features/system-creation/system-creation-wizard.js';

const field: CharacterSheetField = {
  key: 'origin', label: 'Origem', type: 'short_text', required: true, position: 0, show_on_card: true,
};

describe('character sheet model', () => {
  it('keeps positions contiguous when fields are added, removed, and reordered', () => {
    const withNewField = addSheetField([field]);
    expect(withNewField).toHaveLength(2);
    expect(withNewField.map(({ position }) => position)).toEqual([0, 1]);

    const moved = moveSheetField(withNewField, withNewField[1]!.key, 'up');
    expect(moved.map(({ key }) => key)).toEqual([withNewField[1]!.key, 'origin']);
    expect(moved.map(({ position }) => position)).toEqual([0, 1]);

    const removed = removeSheetField(moved, 'origin');
    expect(removed).toHaveLength(1);
    expect(removed[0]?.position).toBe(0);
  });

  it('rejects duplicate keys and malformed select fields', () => {
    expect(isCharacterSheetDefinitionValid([field, { ...field, position: 1 }])).toBe(false);
    expect(isCharacterSheetDefinitionValid([{
      key: 'class', label: 'Classe', type: 'single_select', required: true, position: 0, show_on_card: true, options: [],
    }])).toBe(false);
    expect(isCharacterSheetDefinitionValid([{
      ...field, type: 'unsupported',
    } as unknown as CharacterSheetField])).toBe(false);
  });
});

describe('character sheet builder', () => {
  it('renders the built-in name and configurable field controls', () => {
    const html = renderToStaticMarkup(createElement(CharacterSheetBuilder, {
      fields: [field], onChange: vi.fn(),
    }));
    expect(html).toContain('Nome do personagem');
    expect(html).toContain('Origem');
    expect(html).toContain('Tipo do campo Origem');
    expect(html).toContain('Obrigatório');
    expect(html).toContain('Exibir na galeria');
  });

  it('labels add, move, and remove controls accessibly', () => {
    const html = renderToStaticMarkup(createElement(CharacterSheetBuilder, {
      fields: [field], onChange: vi.fn(),
    }));
    expect(html).toContain('Adicionar campo');
    expect(html).toContain('Mover campo Origem para cima');
    expect(html).toContain('Mover campo Origem para baixo');
    expect(html).toContain('Remover campo Origem');
  });
});

describe('system dashboard and creation', () => {
  it('lists owned systems with an entry action and a create action', () => {
    const html = renderToStaticMarkup(createElement(SystemsSection, {
      systems: [{ id: 'sys-1', slug: 'fantasia', name: 'Fantasia', description: null }],
      loading: false,
      error: null,
      onCreate: vi.fn(),
      onEnter: vi.fn(),
    }));
    expect(html).toContain('Fantasia');
    expect(html).toContain('Entrar no sistema Fantasia');
    expect(html).toContain('Criar sistema');
  });

  it('builds a system with its sheet and routes to character selection', async () => {
    const createSystem = vi.fn().mockResolvedValue({ id: 'sys-created', slug: 'meu-sistema', name: 'Meu Sistema', description: null });
    const push = vi.fn();
    const html = renderToStaticMarkup(createElement(SystemCreationWizard, { createSystem, push }));
    expect(html).toContain('Nome do sistema');
    expect(html).toContain('Continuar para ficha');
  });
});
