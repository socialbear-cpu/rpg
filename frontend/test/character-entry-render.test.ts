import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { CharacterSheetField, SystemCharacter } from '../src/api.js';
import { CharacterGallery } from '../src/features/characters/character-gallery.js';
import { CharacterForm } from '../src/features/characters/character-form.js';
import { CharacterHome } from '../src/features/characters/character-home.js';

const fields: CharacterSheetField[] = [
  { key: 'class', label: 'Classe', type: 'single_select', required: true, position: 0, show_on_card: true, options: ['Guerreiro', 'Mago'] },
  { key: 'notes', label: 'História', type: 'long_text', required: false, position: 1, show_on_card: false },
];
const character: SystemCharacter = {
  id: 'char-1', game_system_id: 'sys-1', character_name: 'Ayla', attributes: { class: 'Mago', notes: 'Uma história longa' }, status: 'active',
};

describe('character entry', () => {
  it('shows the system gallery, card fields, and character actions', () => {
    const html = renderToStaticMarkup(createElement(CharacterGallery, {
      systemName: 'Crônicas', fields, characters: [character], onCreate: vi.fn(), onEnter: vi.fn(),
    }));
    expect(html).toContain('Crônicas');
    expect(html).toContain('Ayla');
    expect(html).toContain('Mago');
    expect(html).toContain('Entrar com Ayla');
    expect(html).toContain('Criar personagem');
  });

  it('renders controls from the configured sheet and keeps the name required', () => {
    const html = renderToStaticMarkup(createElement(CharacterForm, { fields, onSubmit: vi.fn(), onCancel: vi.fn() }));
    expect(html).toContain('Nome do personagem');
    expect(html).toContain('aria-required="true"');
    expect(html).toContain('Classe');
    expect(html).toContain('Guerreiro');
    expect(html).toContain('História');
  });

  it('shows only the active character summary and a switch action', () => {
    const html = renderToStaticMarkup(createElement(CharacterHome, {
      systemName: 'Crônicas', character, fields, onSwitch: vi.fn(),
    }));
    expect(html).toContain('Crônicas');
    expect(html).toContain('Ayla');
    expect(html).toContain('Mago');
    expect(html).not.toContain('Uma história longa');
    expect(html).toContain('Trocar personagem');
  });

  it('renders a safe unavailable state when the selected character is missing', () => {
    const html = renderToStaticMarkup(createElement(CharacterHome, {
      systemName: 'Crônicas', character: null, fields, onSwitch: vi.fn(),
    }));
    expect(html).toContain('Personagem indisponível');
    expect(html).not.toContain('Ayla');
  });
});
