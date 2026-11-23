import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GroupCreationForm } from '../src/features/messages/group-creation-form';

const props = {
  name: 'Nossa mesa', friends: [{ user_id: 'ana', display_name: 'Ana', username: 'ana' }, { user_id: 'bia', display_name: 'Bia', username: 'bia' }],
  selectedIds: ['ana'], loading: false, error: '', busy: false,
  onNameChange: vi.fn(), onToggleFriend: vi.fn(), onSubmit: vi.fn(), onCancel: vi.fn(), onRetry: vi.fn(),
};

describe('creating a group with friends', () => {
  it('lists friends as selectable participants and identifies the selected friend', () => {
    const html = renderToStaticMarkup(createElement(GroupCreationForm, props));
    expect(html).toContain('Amigos do grupo');
    expect(html).toMatch(/type="checkbox"[^>]*checked=""[^>]*value="ana"/);
    expect(html).toContain('value="bia"');
    expect(html).toContain('Ana');
    expect(html).toContain('Bia');
    expect(html).toContain('1 amigo selecionado');
    expect(html).toContain('Criar grupo');
  });
  it('offers the friends page when the user has no friends', () => {
    const html = renderToStaticMarkup(createElement(GroupCreationForm, { ...props, friends: [], selectedIds: [] }));
    expect(html).toContain('href="/friends"');
    expect(html).toContain('Você ainda não tem amigos adicionados.');
  });
  it('does not allow submitting while the friends list is loading', () => {
    const html = renderToStaticMarkup(createElement(GroupCreationForm, { ...props, loading: true }));
    expect(html).toContain('Carregando amigos');
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled/);
  });
  it('offers a retry without treating an error as an empty friends list', () => {
    const html = renderToStaticMarkup(createElement(GroupCreationForm, { ...props, error: 'Falha ao carregar amigos.' }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('Tentar novamente');
    expect(html).not.toContain('Você ainda não tem amigos adicionados.');
  });
});
