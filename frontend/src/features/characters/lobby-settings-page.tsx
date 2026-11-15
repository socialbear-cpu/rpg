'use client';

import { useEffect, useState } from 'react';
import { getGameSystems, getMySystemMemberships, getSystemLobbySettings, type GameSystem, type SystemLobbySettings } from '../../api';
import { AppHeader } from '../shell/app-header';
import { LobbyCustomizationForm } from './lobby-customization-form';
import './characters.css';
import './lobby-creator-tools.css';

type PageState = 'loading' | 'ready' | 'forbidden' | 'error';

export function LobbySettingsPage({ systemId }: { systemId: string }) {
  const [pageState, setPageState] = useState<PageState>('loading');
  const [system, setSystem] = useState<GameSystem | null>(null);
  const [settings, setSettings] = useState<SystemLobbySettings | null>(null);
  const [pageError, setPageError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setPageState('loading');
    setPageError('');

    async function load() {
      try {
        const [systemsResult, memberships] = await Promise.all([
          getGameSystems({ includeArchived: true }),
          getMySystemMemberships(),
        ]);
        if (!active) return;
        const loadedSystem = systemsResult.systems.find((entry) => entry.id === systemId);
        const canManage = Boolean(memberships.is_platform_admin || memberships.memberships.some((membership) => membership.game_system_id === systemId && membership.role === 'owner'));
        if (!loadedSystem || !canManage) {
          setPageState('forbidden');
          return;
        }

        const lobby = await getSystemLobbySettings(systemId);
        if (!active) return;
        setSystem(loadedSystem);
        setSettings(lobby.settings);
        setPageState('ready');
      } catch (reason) {
        if (!active) return;
        setPageError(reason instanceof Error ? reason.message : 'Não foi possível carregar a configuração do saguão.');
        setPageState('error');
      }
    }

    void load();
    return () => { active = false; };
  }, [systemId, loadAttempt]);

  const charactersHref = `/systems/${encodeURIComponent(systemId)}/characters`;
  if (pageState === 'loading') return <main className="character-entry-page"><AppHeader activeItem="Meus Sistemas" /><p role="status">Carregando configuração do saguão...</p></main>;
  if (pageState === 'forbidden') return <main className="character-entry-page"><AppHeader activeItem="Meus Sistemas" backHref={charactersHref} backLabel="Voltar aos personagens" /><section className="character-unavailable"><h1>Acesso restrito</h1><p>Somente o dono do sistema ou um administrador da plataforma pode configurar o saguão.</p></section></main>;
  if (pageState === 'error') return <main className="character-entry-page"><AppHeader activeItem="Meus Sistemas" backHref={charactersHref} backLabel="Voltar aos personagens" /><section className="character-unavailable"><h1>Não foi possível carregar a configuração</h1><p role="alert">{pageError}</p><button className="character-primary-button" type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Tentar novamente</button></section></main>;
  if (!system || !settings) return null;

  return <main className="character-entry-page lobby-settings-page">
    <AppHeader activeItem="Meus Sistemas" backHref={charactersHref} backLabel="Voltar aos personagens" />
    <header className="character-entry-heading">
      <span className="character-entry-eyebrow">{system.name}</span>
      <h1>Configurar saguão</h1>
      <p>Personalize a apresentação e as seções que aparecem para os personagens.</p>
    </header>
    <section className="lobby-creator-tools lobby-settings-card" aria-label="Personalização do saguão">
      <div className="lobby-customization"><LobbyCustomizationForm system={system} settings={settings} onSettingsSaved={setSettings} onSystemSaved={setSystem} /></div>
    </section>
  </main>;
}
