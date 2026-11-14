import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { CharacterSheetField } from '../src/api.js';
import {
  addSheetComponent,
  addSheetStep,
  addSheetVisualElement,
  createDefaultCharacterSheetDefinition,
  moveSheetComponent,
  moveSheetComponentToStep,
  moveSheetStep,
  removeSheetComponent,
  removeSheetStep,
  removeSheetVisualElement,
} from '../src/features/system-creation/sheet-model.js';
import {
  addSheetField,
  isCharacterSheetDefinitionValid,
  moveSheetField,
  removeSheetField,
} from '../src/features/system-creation/sheet-model.js';
import { CharacterSheetBuilder } from '../src/features/system-creation/character-sheet-builder.js';
import { SystemsSection } from '../src/features/dashboard/systems-section.js';
import { SystemCreationWizard } from '../src/features/system-creation/system-creation-wizard.js';
import { SystemDetailsEditor } from '../src/features/system-management/system-details-editor.js';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

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

describe('visual character sheet model', () => {
  it('creates a default stage and keeps stage order contiguous through edits', () => {
    const empty = createDefaultCharacterSheetDefinition();
    expect(empty.steps).toHaveLength(1);
    expect(empty.steps[0]?.components).toEqual([]);

    const withSecond = addSheetStep(empty);
    const moved = moveSheetStep(withSecond, withSecond.steps[1]!.key, 'up');
    expect(moved.steps.map(({ position }) => position)).toEqual([0, 1]);
    expect(moved.steps.map(({ key }) => key)).toEqual([withSecond.steps[1]!.key, withSecond.steps[0]!.key]);
    expect(removeSheetStep(moved, withSecond.steps[1]!.key).steps).toHaveLength(1);
  });

  it('adds, orders, and removes components only within the selected stage', () => {
    const definition = createDefaultCharacterSheetDefinition();
    const stepKey = definition.steps[0]!.key;
    const first = addSheetComponent(definition, stepKey);
    const second = addSheetComponent(first, stepKey);
    const moved = moveSheetComponent(second, stepKey, second.steps[0]!.components[1]!.key, 'up');
    expect(moved.steps[0]?.components.map(({ position }) => position)).toEqual([0, 1]);
    expect(moved.steps[0]?.components[0]?.key).toBe(second.steps[0]?.components[1]?.key);
    expect(removeSheetComponent(moved, stepKey, moved.steps[0]!.components[0]!.key).steps[0]?.components).toHaveLength(1);
  });

  it('moves a component between stages and reindexes both stages', () => {
    const first = createDefaultCharacterSheetDefinition();
    const withComponent = addSheetComponent(first, first.steps[0]!.key);
    const second = addSheetStep(withComponent);
    const result = moveSheetComponentToStep(second, second.steps[0]!.key, second.steps[1]!.key, second.steps[0]!.components[0]!.key);
    expect(result.steps[0]?.components).toEqual([]);
    expect(result.steps[1]?.components[0]?.position).toBe(0);
  });

  it('adds and removes free-positioned visual elements per page', () => {
    const definition = createDefaultCharacterSheetDefinition();
    const withText = addSheetVisualElement(definition, 'step_1', 'text');
    expect(withText.steps[0]?.elements?.[0]).toMatchObject({ type: 'text', x: 5, y: 5, width: 30, height: 15, rotation: 0 });
    const withImage = addSheetVisualElement(withText, 'step_1', 'image');
    expect(withImage.steps[0]?.elements).toHaveLength(2);
    expect(removeSheetVisualElement(withImage, 'step_1', withImage.steps[0]!.elements![0]!.key).steps[0]?.elements).toHaveLength(1);
  });

  it('validates visual element bounds and image URLs before saving', () => {
    const visualDefinition = {
      version: 1 as const,
      steps: [{ key: 'step_1', label: 'Etapa 1', position: 0, components: [], elements: [
        { key: 'portrait', type: 'image' as const, image_url: 'https://cdn.example/portrait.jpg', description: 'Retrato', x: 60, y: 5, width: 30, height: 40, rotation: 0 },
      ] }],
    };
    expect(isCharacterSheetDefinitionValid(visualDefinition)).toBe(true);
    expect(isCharacterSheetDefinitionValid({ ...visualDefinition, steps: [{ ...visualDefinition.steps[0]!, elements: [{ ...visualDefinition.steps[0]!.elements[0]!, x: 80 }] }] })).toBe(false);
    expect(isCharacterSheetDefinitionValid({ ...visualDefinition, steps: [{ ...visualDefinition.steps[0]!, elements: [{ ...visualDefinition.steps[0]!.elements[0]!, image_url: 'http://cdn.example/portrait.jpg' }] }] })).toBe(false);
  });
});

describe('character sheet builder', () => {
  it('renders the built-in name and configurable field controls', () => {
    const definition = { version: 1 as const, steps: [{ key: 'step_1', label: 'Etapa 1', position: 0, components: [{ key: field.key, label: field.label, type: 'short_text' as const, required: field.required, position: 0, width: 'full' as const, show_on_card: field.show_on_card }] }] };
    const html = renderToStaticMarkup(createElement(CharacterSheetBuilder, {
      definition, onChange: vi.fn(),
    }));
    expect(html).toContain('Nome do personagem');
    expect(html).toContain('Origem');
    expect(html).toContain('Nome do campo');
    expect(html).toContain('Obrigatório');
    expect(html).toContain('Exibir na galeria');
  });

  it('labels add, move, and remove controls accessibly', () => {
    const definition = { version: 1 as const, steps: [{ key: 'step_1', label: 'Etapa 1', position: 0, components: [{ key: field.key, label: field.label, type: 'short_text' as const, required: field.required, position: 0, width: 'full' as const, show_on_card: field.show_on_card }] }] };
    const html = renderToStaticMarkup(createElement(CharacterSheetBuilder, {
      definition, onChange: vi.fn(),
    }));
    expect(html).toContain('Adicionar componente');
    expect(html).toContain('Mover campo Origem para cima');
    expect(html).toContain('Mover campo Origem para baixo');
    expect(html).toContain('Remover</button>');
    expect(html).toContain('Adicionar etapa');
    expect(html).toContain('Prévia para jogadores');
    expect(html).toContain('Imagens e textos livres');
    expect(html).toContain('tamanho e rotação');
    expect(html).toContain('+ Imagem');
  });
});

describe('system dashboard and creation', () => {
  it('lists owned systems with entry and management actions plus a create action', () => {
    const html = renderToStaticMarkup(createElement(SystemsSection, {
      systems: [{ id: 'sys-1', slug: 'fantasia', name: 'Fantasia', description: null, play_mode: 'voice', tags: [{ slug: 'terror', label: 'Terror' }] }],
      loading: false,
      error: null,
      onCreate: vi.fn(),
      onEnter: vi.fn(),
      ownerSystemIds: new Set(['sys-1']),
      onManage: vi.fn(),
    }));
    expect(html).toContain('Fantasia');
    expect(html).toContain('◉ Voz');
    expect(html).toContain('Terror');
    expect(html).toContain('Entrar no sistema Fantasia');
    expect(html).toContain('Criar sistema');
    expect(html).toContain('Gerenciar Fantasia');
    expect(html).not.toContain('Editar ficha');
  });

  it('builds a system with its sheet and routes to character selection', async () => {
    const createSystem = vi.fn().mockResolvedValue({ id: 'sys-created', slug: 'meu-sistema', name: 'Meu Sistema', description: null });
    const push = vi.fn();
    const html = renderToStaticMarkup(createElement(SystemCreationWizard, { createSystem, push }));
    expect(html).toContain('Nome do sistema');
    expect(html).toContain('Descrição');
    expect(html).toContain('Modalidade principal');
    expect(html).toContain('Etiquetas');
    expect(html).toContain('Continuar para ficha');
  });

  it('edits the same basic system fields used during creation', () => {
    const html = renderToStaticMarkup(createElement(SystemDetailsEditor, {
      system: { id: 'sys-1', name: 'Meu Sistema', description: 'Uma descrição', play_mode: 'voice', tags: [{ slug: 'fantasia', label: 'Fantasia' }] },
      onSaved: vi.fn(),
    }));
    expect(html).toContain('Nome do sistema');
    expect(html).toContain('Descrição');
    expect(html).toContain('value="Meu Sistema"');
    expect(html).toContain('Uma descrição');
    expect(html).toContain('RPG');
    expect(html).toContain('Modalidade principal');
    expect(html).toContain('Salvar informações');
  });
});
