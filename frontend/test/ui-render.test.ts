import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AccountCard } from '../src/features/account/account-card.js';
import { ProfileCard } from '../src/features/profile/profile-card.js';
import { Dashboard } from '../src/features/dashboard/dashboard.js';
import { RpgApp } from '../app/rpg-app.js';
import { checkHealth } from '../src/api.js';
import { AppHeader } from '../src/features/shell/app-header.js';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
}));

describe('account card', () => {
  const accountCardProps = {
    mode: 'login' as const,
    recovery: false,
    authenticated: false,
    email: '',
    password: '',
    displayName: '',
    newPassword: '',
    authBusy: false,
    recoveryBusy: false,
    onModeChange: () => {},
    onEmailChange: () => {},
    onPasswordChange: () => {},
    onDisplayNameChange: () => {},
    onNewPasswordChange: () => {},
    onSubmitAuth: () => {},
    onSubmitRecovery: () => {},
    onResetPassword: () => {},
    onLogout: () => {},
  };

  it('renders login, signup, recovery, and signed-out session controls', () => {
    const html = renderToStaticMarkup(createElement(AccountCard, accountCardProps));

    expect(html).toContain('class="tab nexus-tab"');
    expect(html).toContain('id="tab-login"');
    expect(html).toContain('id="tab-signup"');
    expect(html).toContain('Esqueci minha senha');
    expect(html).toContain('SESSÃO');
    expect(html).toContain('Não autenticado');
    expect(html).toContain('>Sair</button>');
  });

  it('shows the display name field and marks signup as selected', () => {
    const html = renderToStaticMarkup(createElement(AccountCard, { ...accountCardProps, mode: 'signup' }));

    expect(html).toContain('Nome de exibição');
    expect(html).toContain('class="tab nexus-tab"');
    expect(html).toContain('id="tab-signup" type="button" role="tab" aria-selected="true"');
  });

  it('shows the recovery form without tabs and disables submit while busy', () => {
    const html = renderToStaticMarkup(createElement(AccountCard, { ...accountCardProps, recovery: true, recoveryBusy: true }));

    expect(html).toContain('Defina uma nova senha para concluir a recuperação da conta.');
    expect(html).not.toContain('role="tablist"');
    expect(html).toContain('disabled="">Atualizando…</button>');
  });
});

describe('profile card', () => {
  it('renders profile fields and actions disabled while signed out', () => {
    const html = renderToStaticMarkup(createElement(ProfileCard, {
      profile: { displayName: '', avatarUrl: '', bio: '' },
      authenticated: false,
      profileBusy: false,
      onProfileChange: () => {},
      onLoadProfile: () => {},
      onSaveProfile: () => {},
    }));

    expect(html).toContain('id="profile-name"');
    expect(html).toContain('id="profile-avatar"');
    expect(html).toContain('id="profile-bio"');
    expect(html).toContain('id="load-profile"');
    expect(html).toContain('id="save-profile"');
    expect(html).toMatch(/id="profile-name"[^>]*disabled/);
    expect(html).toMatch(/id="profile-avatar"[^>]*disabled/);
    expect(html).toMatch(/id="profile-bio"[^>]*disabled/);
    expect(html).toMatch(/disabled=""[^>]*>Salvar alterações/);
  });

  it('enables profile inputs and keeps save disabled while busy', () => {
    const html = renderToStaticMarkup(createElement(ProfileCard, {
      profile: { displayName: 'RPG Player', avatarUrl: '', bio: '' },
      authenticated: true,
      profileBusy: true,
      onProfileChange: () => {},
      onLoadProfile: () => {},
      onSaveProfile: () => {},
    }));

    expect(html).toContain('value="RPG Player"');
    expect(html).not.toMatch(/id="profile-name"[^>]*disabled/);
    expect(html).toContain('disabled="">Salvando…</button>');
  });
});

describe('initial application UI', () => {
  it('links navigation and profile actions to their own screens', () => {
    const html = renderToStaticMarkup(createElement(AppHeader, { activeItem: 'Trocas' }));

    expect(html).toContain('href="/dashboard"');
    const tradeLinks = html.match(/<a\b[^>]*>Trocas<\/a>/g) ?? [];
    expect(tradeLinks).toHaveLength(2);
    for (const link of tradeLinks) {
      expect(link).toContain('href="/trading"');
      expect(link).toContain('aria-current="page"');
    }
    expect(html).toMatch(/href="\/dashboard\/systems\/new"[^>]*>Criar sistema/);
    expect(html).toContain('href="/profile">Meu perfil');
    expect(html).not.toContain('Explorar sistemas');
    expect(html).not.toContain('Comunidade');
  });

  it('shows the public login experience without exposing profile controls before sign-in', () => {
    const html = renderToStaticMarkup(createElement(RpgApp));
    expect(html).toContain('class="auth-landing "');
    expect(html).toContain('O seu mundo.');
    expect(html).toContain('role="tab" aria-selected="true" aria-controls="panel-auth"');
    expect(html).toContain('id="tab-signup" type="button" role="tab" aria-selected="false"');
    expect(html).not.toContain('id="profile-name"');
  });

  it('greets the dashboard player by their selected nick', () => {
    const html = renderToStaticMarkup(createElement(Dashboard, { playerName: '@nexus42', onLogout: () => {} }));

    expect(html).toContain('Olá, @nexus42!');
  });

  it('checks API health through the same-origin path', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBe('/healthz');
      return Response.json({ status: 'ok' });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(checkHealth()).resolves.toEqual({ status: 'ok' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
