import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { CharacterSheetDefinition, CharacterSheetField, SystemCharacter } from '../src/api.js';
import { CharacterGallery } from '../src/features/characters/character-gallery.js';
import { CharacterForm } from '../src/features/characters/character-form.js';
import { CharacterHome } from '../src/features/characters/character-home.js';
import { CharacterSheetStepRenderer } from '../src/features/character-sheet/character-sheet-step-renderer.js';

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
      systemName: 'Crônicas', character, fields, onSwitch: vi.fn(),
    }));
    expect(html).toContain('Crônicas');
    expect(html).toContain('Ayla');
    expect(html).toContain('Mago');
    expect(html).not.toContain('Uma história longa');
    expect(html).toContain('Salas de bate-papo');
    expect(html).toContain('>Recompensa diária</button>');
    expect(html).toContain('<dialog');
  });

  it('renders a safe unavailable state when the selected character is missing', () => {
    const html = renderToStaticMarkup(createElement(CharacterHome, {
      systemName: 'Crônicas', character: null, fields, onSwitch: vi.fn(),
    }));
    expect(html).toContain('Personagem indisponível');
    expect(html).not.toContain('Ayla');
    expect(html).not.toContain('<dialog');
  });
});
