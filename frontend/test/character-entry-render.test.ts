import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { CharacterSheetDefinition, CharacterSheetField, GameSystem, SystemCharacter } from '../src/api.js';
import { CharacterGallery } from '../src/features/characters/character-gallery.js';
import { CharacterForm } from '../src/features/characters/character-form.js';
import { CharacterHome } from '../src/features/characters/character-home.js';
import { CharacterRecord } from '../src/features/characters/character-record.js';
import { CharacterSheetStepRenderer } from '../src/features/character-sheet/character-sheet-step-renderer.js';
import { CharacterSheetBuilder } from '../src/features/system-creation/character-sheet-builder.js';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));

const fields: CharacterSheetField[] = [
  { key: 'class', label: 'Classe', type: 'single_select', required: true, position: 0, show_on_card: true, options: ['Guerreiro', 'Mago'] },
  { key: 'notes', label: 'História', type: 'long_text', required: false, position: 1, show_on_card: false },
];
const definition: CharacterSheetDefinition = { version: 1, steps: [{ key: 'identity', label: 'Identidade', position: 0, components: [
  { key: 'class', label: 'Classe', type: 'single_select', presentation: 'cards', required: true, position: 0, width: 'full', show_on_card: true, options: [{ label: 'Guerreiro' }, { label: 'Mago' }] },
  { key: 'notes', label: 'História', type: 'long_text', required: false, position: 1, width: 'full', show_on_card: false },
] }] };
const character: SystemCharacter = {
  id: 'char-1', game_system_id: 'sys-1', character_name: 'Ayla', attributes: { class: 'Mago', notes: 'Uma história longa' }, status: 'active',
};
const system: GameSystem = {
  id: 'sys-1', slug: 'cronicas', name: 'Crônicas', description: 'Uma aventura sombria.',
  cover_image_path: '37000000-0000-4000-8000-000000000001/47000000-0000-4000-8000-000000000001.webp',
  cover_focus_x: 25, cover_focus_y: 65,
};

describe('character entry', () => {
  it('shows the system gallery, card fields, and character actions', () => {
    const html = renderToStaticMarkup(createElement(CharacterGallery, {
      systemName: 'Crônicas',
      system: { id: 'sys-1', slug: 'cronicas', name: 'Crônicas', description: 'Uma aventura sombria.', play_mode: 'voice', tags: [{ slug: 'terror', label: 'Terror' }] },
      fields, characters: [character], selectedCharacterId: character.id, onCreate: vi.fn(), onEnter: vi.fn(),
    }));
    expect(html).toContain('Crônicas');
    expect(html).toContain('Ayla');
    expect(html).toContain('Mago');
    expect(html).toContain('PERSONAGEM CRIADO');
    expect(html).toContain('Entrar com Ayla');
    expect(html).toContain('Criar personagem');
    expect(html).toContain('RPG por voz');
    expect(html).toContain('Uma aventura sombria.');
    expect(html).toContain('Terror');
  });

  it('shows the system management action only when the owner provides it', () => {
    const props = {
      systemName: 'Crônicas',
      fields,
      characters: [character],
      onCreate: vi.fn(),
      onEnter: vi.fn(),
    };
    const ownerHtml = renderToStaticMarkup(createElement(CharacterGallery, { ...props, onManage: vi.fn() }));
    const playerHtml = renderToStaticMarkup(createElement(CharacterGallery, props));

    expect(ownerHtml).toContain('Gerenciar sistema');
    expect(playerHtml).not.toContain('Gerenciar sistema');
  });

  it('starts the wizard with the required character-name page', () => {
    const html = renderToStaticMarkup(createElement(CharacterForm, { definition, onSubmit: vi.fn(), onCancel: vi.fn() }));
    expect(html).toContain('Nome do personagem');
    expect(html).toContain('aria-required="true"');
    expect(html).toContain('Página 1 de 4');
    expect(html).not.toContain('Classe');
    expect(html).not.toContain('História');
  });

  it('supports rendering all fields together in a single-page layout', () => {
    const html = renderToStaticMarkup(createElement(CharacterForm, {
      definition: { ...definition, layout_mode: 'single_page' },
      onSubmit: vi.fn(),
      onCancel: vi.fn(),
    }));
    expect(html).toContain('Ficha completa');
    expect(html).toContain('Dados do personagem');
    expect(html).toContain('Classe');
    expect(html).toContain('História');
    expect(html).not.toContain('Página 1 de 4');
  });

  it('renders image descriptions as hover text in the sheet step renderer', () => {
    const twoStepDefinition: CharacterSheetDefinition = {
      ...definition,
      steps: [
        { ...definition.steps[0]!, elements: [{ key: 'portrait', type: 'image', image_url: 'https://cdn.example/ayla.jpg', description: 'Retrato de Ayla', x: 60, y: 5, width: 30, height: 40, rotation: 0 }] },
        { key: 'details', label: 'Detalhes', position: 1, components: [] },
      ],
    };
    const html = renderToStaticMarkup(createElement(CharacterSheetStepRenderer, {
      step: twoStepDefinition.steps[0]!,
      values: {},
      onValueChange: vi.fn(),
      mode: 'preview',
    }));
    expect(html).toContain('title="Retrato de Ayla"');
  });

  it('uses the shared selected tab style in the sheet builder step navigation', () => {
    const html = renderToStaticMarkup(createElement(CharacterSheetBuilder, { definition, onChange: vi.fn() }));
    expect(html).toContain('class="nexus-tab" aria-current="step"');
  });

  it('keeps canvas positions and exposes an expand control during creation', () => {
    const canvasStep: CharacterSheetDefinition['steps'][number] = {
      key: 'choices', label: 'Escolhas', position: 0,
      components: [{
        key: 'origin', label: 'Origem', type: 'single_select', presentation: 'canvas',
        required: true, position: 0, width: 'full', show_on_card: false,
        options: [{ label: 'Floresta', x: 12, y: 18, width: 30, height: 40, rotation: -7 }],
      }],
      elements: [{ key: 'landscape', type: 'image', image_url: 'https://cdn.example/landscape.jpg', x: 5, y: 6, width: 45, height: 50, rotation: 9 }],
    };
    const html = renderToStaticMarkup(createElement(CharacterSheetStepRenderer, {
      step: canvasStep, values: {}, onValueChange: vi.fn(), mode: 'entry',
    }));
    expect(html).toContain('Ampliar composição');
    expect(html).toContain('left:12%;top:18%;width:30%;height:40%;transform:rotate(-7deg)');
    expect(html).toContain('left:5%;top:6%;width:45%;height:50%;transform:rotate(9deg)');
    expect(html).toContain('aria-checked="false"');
  });

  it('shows only the active character summary and a switch action', () => {
    const html = renderToStaticMarkup(createElement(CharacterHome, {
      system, character, fields, onSwitch: vi.fn(), sheetDefinition: definition,
      inventory: null, recordLoading: false, sheetError: null, inventoryError: null, onRefreshRecord: vi.fn(),
    }));
    expect(html).toContain('Crônicas');
    expect(html).toContain('Ayla');
    expect(html).toContain('Mago');
    expect(html).not.toContain('Uma história longa');
    expect(html).toContain('Salas de bate-papo');
    expect(html).toContain('Minha Ficha');
    expect(html).toContain('Consultar dados e inventário');
    expect(html).toContain('>Recompensa diária</button>');
    expect(html).toContain('<dialog');
  });

  it('personalizes the system lobby with its configured cover and description', () => {
    const html = renderToStaticMarkup(createElement(CharacterHome, {
      system, character, fields, onSwitch: vi.fn(), sheetDefinition: definition,
      inventory: null, recordLoading: false, sheetError: null, inventoryError: null, onRefreshRecord: vi.fn(),
    }));

    expect(html).toContain('aria-label="Apresentação de Crônicas"');
    expect(html).toContain('alt="Capa de Crônicas"');
    expect(html).toContain('Uma aventura sombria.');
  });

  it('provides accessible fallbacks when system cover or description is missing', () => {
    const html = renderToStaticMarkup(createElement(CharacterHome, {
      system: { ...system, description: null, cover_image_path: null },
      character, fields, onSwitch: vi.fn(), sheetDefinition: definition,
      inventory: null, recordLoading: false, sheetError: null, inventoryError: null, onRefreshRecord: vi.fn(),
    }));

    expect(html).toContain('aria-label="Capa padrão de Crônicas"');
    expect(html).toContain('Este sistema ainda não tem uma descrição.');
  });

  it('renders a safe unavailable state when the selected character is missing', () => {
    const html = renderToStaticMarkup(createElement(CharacterHome, {
      system, character: null, fields, onSwitch: vi.fn(), sheetDefinition: definition,
      inventory: null, recordLoading: false, sheetError: null, inventoryError: null, onRefreshRecord: vi.fn(),
    }));
    expect(html).toContain('Personagem indisponível');
    expect(html).not.toContain('Ayla');
    expect(html).not.toContain('<dialog');
  });

  it('renders configured character fields and persisted inventory item details', () => {
    const inventory = {
      character: { id: character.id, game_system_id: character.game_system_id, character_name: character.character_name },
      stacks: [{
        stack_id: 'stack-1', item_id: 'item-1', item_name: 'Poção lunar',
        description: 'Recupera energia.', item_type: 'consumable',
        rules_data: { image_url: 'https://cdn.example/potion.png', rarity: 'rara' },
        quantity: 3, metadata: { condition: 'lacrada' },
      }],
    };
    const html = renderToStaticMarkup(createElement(CharacterRecord, {
      character, definition, experience: null, inventory, activeTab: 'sheet', onTabChange: vi.fn(),
      loading: false, sheetError: null, inventoryError: null, onRefresh: vi.fn(), onClose: vi.fn(),
    }));
    expect(html).toContain('Ayla');
    expect(html).toContain('Classe');
    expect(html).toContain('Mago');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('id="character-record-tab-sheet" type="button" role="tab" aria-selected="true" aria-controls="character-record-panel" tabindex="0"');
    expect(html).toContain('id="character-record-tab-inventory" type="button" role="tab" aria-selected="false" aria-controls="character-record-panel" tabindex="-1"');
    expect(html).toContain('id="character-record-panel" role="tabpanel" aria-labelledby="character-record-tab-sheet" class="character-record-panel" tabindex="0"');
    expect(html).toContain('class="nexus-tab"');

    const inventoryHtml = renderToStaticMarkup(createElement(CharacterRecord, {
      character, definition, experience: null, inventory, activeTab: 'inventory', onTabChange: vi.fn(),
      loading: false, sheetError: null, inventoryError: null, onRefresh: vi.fn(), onClose: vi.fn(),
    }));
    expect(inventoryHtml).toContain('id="character-record-tab-sheet" type="button" role="tab" aria-selected="false" aria-controls="character-record-panel" tabindex="-1"');
    expect(inventoryHtml).toContain('id="character-record-tab-inventory" type="button" role="tab" aria-selected="true" aria-controls="character-record-panel" tabindex="0"');
    expect(inventoryHtml).toMatch(/id="character-record-panel"[^>]*class="character-record-panel"[^>]*>/);
    expect(inventoryHtml.match(/<div id="character-record-panel"[^>]*>/)?.[0]).not.toContain('tabindex="0"');
    expect(inventoryHtml).toContain('Poção lunar');
    expect(inventoryHtml).toContain('Quantidade: 3');
    expect(inventoryHtml).toContain('Consumíveis');
  });
});
