'use client';

import { useEffect, useState } from 'react';
import { getGameSystems, getMySystemMemberships, getSystemCharacters, getSystemLobbySettings, type GameSystem, type SystemCharacter, type SystemLobbySettings } from '../../api';
import { AppHeader } from '../shell/app-header';
import { SettingsNav, WorkspaceHeading } from '../shell/workspace-heading';
import { LobbyCustomizationForm } from './lobby-customization-form';
import { LobbyCreatorTools } from './lobby-creator-tools';
import { SystemEventsCard } from '../system-events/system-events-card';
import './characters.css';
import './lobby-creator-tools.css';

type PageState = 'loading' | 'ready' | 'forbidden' | 'error';

export function LobbySettingsPage({ systemId }: { systemId: string }) {
  const [pageState, setPageState] = useState<PageState>('loading');
  const [canCreateRooms, setCanCreateRooms] = useState(false);
  const [system, setSystem] = useState<GameSystem | null>(null);
  const [settings, setSettings] = useState<SystemLobbySettings | null>(null);
  const [characters, setCharacters] = useState<SystemCharacter[]>([]);
  const [characterLoadError, setCharacterLoadError] = useState<string | null>(null);
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
        setCanCreateRooms(memberships.memberships.some(member => member.game_system_id === systemId && member.role === 'owner'));
        const canManage = Boolean(memberships.is_platform_admin || memberships.memberships.some((membership) => membership.game_system_id === systemId && membership.role === 'owner'));
        if (!loadedSystem || !canManage) {
          setPageState('forbidden');
          return;
        }

        const [lobbyResult, charactersResult] = await Promise.allSettled([
          getSystemLobbySettings(systemId),
          getSystemCharacters(systemId),
        ]);
        if (!active) return;
        if (lobbyResult.status === 'rejected') throw lobbyResult.reason;
        setSystem(loadedSystem);
        setSettings(lobbyResult.value.settings);
        if (charactersResult.status === 'fulfilled') {
          setCharacters(charactersResult.value.characters);
          setCharacterLoadError(null);
        } else {
          setCharacters([]);
          setCharacterLoadError(charactersResult.reason instanceof Error ? charactersResult.reason.message : 'Não foi possível carregar os personagens do sistema.');
        }
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
  if (pageState === 'loading') return <main className="character-entry-page bifrost-workspace"><AppHeader activeItem="Meus Sistemas" /><p role="status">Carregando configuração do saguão...</p></main>;
  if (pageState === 'forbidden') return <main className="character-entry-page bifrost-workspace"><AppHeader activeItem="Meus Sistemas" backHref={charactersHref} backLabel="Voltar aos personagens" /><section className="character-unavailable"><h1>Acesso restrito</h1><p>Somente o dono do sistema ou um administrador da plataforma pode configurar o saguão.</p></section></main>;
  if (pageState === 'error') return <main className="character-entry-page bifrost-workspace"><AppHeader activeItem="Meus Sistemas" backHref={charactersHref} backLabel="Voltar aos personagens" /><section className="character-unavailable"><h1>Não foi possível carregar a configuração</h1><p role="alert">{pageError}</p><button className="character-primary-button" type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Tentar novamente</button></section></main>;
  if (!system || !settings) return null;

  return <main className="character-entry-page lobby-settings-page bifrost-workspace">
    <AppHeader activeItem="Meus Sistemas" backHref={charactersHref} backLabel="Voltar aos personagens" />
    <WorkspaceHeading eyebrow={system.name} title="Configurar saguão" description="Prepare o espaço onde as histórias do seu grupo acontecem." />
    <div className="settings-layout">
    <SettingsNav items={[{ href: '#lobby-presentation', label: 'Apresentação e layout' }, { href: '#lobby-tools', label: 'Personagens e conversas' }, { href: '#lobby-events', label: 'Eventos da mesa' }]} />
    <div className="settings-content">
    <section id="lobby-presentation" className="lobby-creator-tools lobby-settings-card" aria-label="Personalização do saguão">
      <header><p className="eyebrow">O SEU MUNDO</p><h2>Apresentação e layout</h2><p>Defina as boas-vindas, a cor e a organização do saguão.</p></header>
      <div className="lobby-customization"><LobbyCustomizationForm system={system} settings={settings} onSettingsSaved={setSettings} onSystemSaved={setSystem} /></div>
    </section>
    <section id="lobby-tools" aria-label="Personagens e conversas"><LobbyCreatorTools system={system} characters={characters} characterLoadError={characterLoadError} canCreateRooms={canCreateRooms} /></section>
    <section id="lobby-events" aria-label="Eventos da mesa"><SystemEventsCard systemId={system.id} canManage /></section>
    </div>
    </div>
  </main>;
}
