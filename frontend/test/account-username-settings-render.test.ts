import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UsernameSettingsField } from '../src/features/account/username-settings-field.js';

describe('account username settings', () => {
  it('offers the single handle change while it is still available', () => {
    const html = renderToStaticMarkup(createElement(UsernameSettingsField, {
      username: 'old_handle',
      draft: 'new_handle',
      changeUsed: false,
      busy: false,
      enabled: true,
      onDraftChange: () => {},
      onSave: () => {},
    }));

    expect(html).toContain('Novo @');
    expect(html).toContain('value="new_handle"');
    expect(html).toContain('Você pode trocar seu @ uma única vez.');
    expect(html).toContain('>Salvar @</button>');
  });

  it('shows the current handle without an edit control after the change is used', () => {
    const html = renderToStaticMarkup(createElement(UsernameSettingsField, {
      username: 'new_handle',
      draft: 'new_handle',
      changeUsed: true,
      busy: false,
      enabled: true,
      onDraftChange: () => {},
      onSave: () => {},
    }));

    expect(html).toContain('value="@new_handle"');
    expect(html).toContain('Sua única troca de @ já foi usada.');
    expect(html).not.toContain('>Salvar @</button>');
  });
});
