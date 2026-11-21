'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { defaultSystemLobbySettings, getGameSystemCoverUrl, type CharacterExperienceSummary, type CharacterInventory, type CharacterSheetDefinition, type CharacterSheetField, type GameSystem, type LobbySectionId, type SystemCharacter, type SystemLobbySettings } from '../../api';
import { SystemStore } from '../store/store-card';
import { AppHeader } from '../shell/app-header';
import { LoginBridge } from '../dashboard/login-identity';
import { DailyLoginPopup } from '../daily-login/daily-login-popup';
import { CharacterRecord } from './character-record';
import { Chats } from '../chats/chats';
import { SystemEventsCard } from '../system-events/system-events-card';
import { LobbyStats } from './lobby-stats';
import { useSystemLobbyPresence } from './lobby-presence';
import './characters.css';

interface CharacterHomeProps {
  system: GameSystem;
  character: SystemCharacter | null;
  sheetDefinition: CharacterSheetDefinition | null;
  inventory: CharacterInventory | null;
  recordLoading: boolean;
  sheetError: string | null;
  inventoryError: string | null;
  onRefreshRecord: () => void;
  fields?: CharacterSheetField[];
  experience?: CharacterExperienceSummary | null;
  onSwitch: () => void;
  dailyRewardVersion?: number;
  onDailyClaimed?: () => void;
  isCreator?: boolean;
  lobbySettings?: SystemLobbySettings;
  preferredChatId?: string | null;
}

export function CharacterHome({ system, character, sheetDefinition, inventory, recordLoading, sheetError, inventoryError, onRefreshRecord, fields = [], experience = null, onSwitch, dailyRewardVersion = 0, onDailyClaimed, isCreator = false, lobbySettings = defaultSystemLobbySettings, preferredChatId: initialPreferredChatId = null }: CharacterHomeProps) {
  const [showCharacterRecord, setShowCharacterRecord] = useState(false);
  const [activeRecordTab, setActiveRecordTab] = useState<'sheet' | 'inventory'>('sheet');
  const [preferredChatId, setPreferredChatId] = useState<string | null>(initialPreferredChatId);
  const [chatPopupOpen, setChatPopupOpen] = useState(false);
  const chatHeading = useRef<HTMLHeadingElement>(null);
  const lobbyPresence = useSystemLobbyPresence(system.id, Boolean(character));

  useEffect(() => {
    if (!chatPopupOpen) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    chatHeading.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !document.querySelector('dialog:modal')) setChatPopupOpen(false);
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('keydown', closeOnEscape); if (trigger?.isConnected) trigger.focus(); };
  }, [chatPopupOpen]);

  if (!character) return <main className="character-entry-page bifrost-workspace"><AppHeader activeItem="Meus Sistemas" backHref="/dashboard" backLabel="Meus sistemas" /><section className="character-unavailable"><span className="character-entry-eyebrow">{system.name}</span><h1>Personagem indisponível</h1><p>Este personagem não está disponível neste sistema.</p><button type="button" className="character-primary-button" onClick={onSwitch}>Voltar aos personagens</button></section></main>;

  const visibleFields = fields.filter((field) => field.show_on_card && Object.hasOwn(character.attributes, field.key));
  const hasDefaultLobbyLayout = lobbySettings.hidden_sections.length === 0
    && lobbySettings.section_order.length === defaultSystemLobbySettings.section_order.length
    && lobbySettings.section_order.every((section, index) => section === defaultSystemLobbySettings.section_order[index]);
  const sectionsInDefaultLayout = hasDefaultLobbyLayout
    ? ['chat', 'events', 'store'] as const
    : null;
  function openCharacterRecord(tab: 'sheet' | 'inventory') {
    setActiveRecordTab(tab);
    setShowCharacterRecord(true);
    onRefreshRecord();
  }

  const sections: Record<LobbySectionId, React.ReactNode> = {
    'system-presentation': <section className="character-system-presentation lobby-character-home-section" aria-label={`Apresentação de ${system.name}`}>
      {system.cover_image_path
        ? <img className="character-system-cover" src={getGameSystemCoverUrl(system.cover_image_path) ?? undefined} alt={`Capa de ${system.name}`} style={{ objectPosition: `${system.cover_focus_x ?? 50}% ${system.cover_focus_y ?? 50}%` }} />
        : <div className="character-system-cover character-system-cover-default" role="img" aria-label={`Capa padrão de ${system.name}`}><LoginBridge /></div>}
      <div className="character-system-details"><span className="system-card-mode">{system.play_mode === 'voice' ? '◉ Voz' : system.play_mode === 'hybrid' ? '◈ Híbrido' : '▤ Texto'}</span><p>{system.description?.trim() || 'Este sistema ainda não tem uma descrição.'}</p></div>
    </section>,
    matchmaking: <section className="lobby-matchmaking lobby-character-home-section" aria-label="Procurar partida">
      <button className="lobby-search-button" type="button" disabled title="O matchmaking estará disponível em breve"><span className="lobby-search-icon" aria-hidden="true">✧</span>Procurar partida<small>Em breve</small></button>
      <span className="lobby-matchmaking-caption">Encontre um grupo para a sua próxima aventura.</span>
    </section>,
    store: <section className="lobby-character-home-section" aria-label="Loja do sistema"><SystemStore key={`${character.id}-${dailyRewardVersion}`} systemId={character.game_system_id} characterId={character.id} characterName={character.character_name} /></section>,
    chat: <Chats characterId={character.id} preferredChatId={preferredChatId} view={hasDefaultLobbyLayout ? 'dashboard' : 'full'} onOpenConversation={(chatId) => { setPreferredChatId(chatId); setChatPopupOpen(true); }} />,
    events: <div className="lobby-character-home-section" id="system-events"><SystemEventsCard systemId={character.game_system_id} /></div>,
    'character-sheet': <section className="lobby-character-record-grid lobby-character-home-section" aria-label="Ficha e inventário do personagem">
      <div className="lobby-character-identity"><span className="lobby-character-avatar" aria-hidden="true">{character.character_name.trim().charAt(0).toLocaleUpperCase('pt-BR')}</span><span><strong>{character.character_name}</strong><small>{system.name}</small></span></div>
      <div className="lobby-character-record-actions">
        <button className="lobby-character-record-action" type="button" onClick={() => openCharacterRecord('sheet')}><span aria-hidden="true">♙</span>Ficha</button>
        <button className="lobby-character-record-action" type="button" onClick={() => openCharacterRecord('inventory')}><span aria-hidden="true">▦</span>Inventário</button>
      </div>
    </section>,
  };

  return (
    <main className="character-entry-page character-home-page bifrost-workspace">
      <AppHeader activeItem="Meus Sistemas" characterSheet={{ systemName: system.name, character, fields: visibleFields, experience }} onOpenCharacterSheet={() => openCharacterRecord('sheet')} onSwitchCharacter={onSwitch}>
        {isCreator && <Link className="app-header-back lobby-settings-link" href={`/systems/${encodeURIComponent(system.id)}/lobby-settings`}>⚙ Ajustes</Link>}
      </AppHeader>

      {showCharacterRecord ? <CharacterRecord
        character={character}
        definition={sheetDefinition}
        experience={experience}
        inventory={inventory}
        activeTab={activeRecordTab}
        onTabChange={setActiveRecordTab}
        loading={recordLoading}
        sheetError={sheetError}
        inventoryError={inventoryError}
        onRefresh={onRefreshRecord}
        onClose={() => setShowCharacterRecord(false)}
      /> : <div className="lobby-layout">
        <div className="lobby-main" style={{ '--lobby-accent': lobbySettings.accent_color } as React.CSSProperties}>
          <nav className="lobby-breadcrumb" aria-label="Caminho de navegação"><Link href="/dashboard">Meus sistemas</Link><span aria-hidden="true">/</span><strong>{system.name}</strong></nav>
          <div className="lobby-overview">
          <header className="lobby-welcome">
            <LoginBridge />
            <div className="lobby-welcome-copy"><span className="character-entry-eyebrow">{system.name} · SAGUÃO</span><h1>{lobbySettings.welcome_title}</h1><p>{lobbySettings.welcome_message}</p></div>
            <div className="lobby-welcome-actions"><DailyLoginPopup systemId={character.game_system_id} onClaimed={onDailyClaimed} /></div>
          </header>
          {hasDefaultLobbyLayout && <div className="lobby-section-slot lobby-section-slot-character-sheet" data-section="character-sheet" style={{ '--lobby-accent': lobbySettings.accent_color } as React.CSSProperties}>{sections['character-sheet']}</div>}
          </div>
          <LobbyStats systemId={character.game_system_id} characterId={character.id} onlineCount={lobbyPresence.onlineCount} onlineUnavailable={lobbyPresence.unavailable} />
          {hasDefaultLobbyLayout && <div className="lobby-context">
            <div className="lobby-section-slot" data-section="system-presentation">{sections['system-presentation']}</div>
            <div className="lobby-section-slot" data-section="matchmaking">{sections.matchmaking}</div>
          </div>}
          {hasDefaultLobbyLayout && <header className="lobby-dashboard-heading"><span className="character-entry-eyebrow">SUA MESA</span><h2>Continue a aventura</h2></header>}
          <section className={`lobby-rooms${sectionsInDefaultLayout ? ' lobby-rooms-default' : ''}`} aria-label="Seções do saguão">{(sectionsInDefaultLayout ?? lobbySettings.section_order).map((section) => lobbySettings.hidden_sections.includes(section) ? null : <div className={`lobby-section-slot lobby-section-slot-${section}`} data-section={section} key={section} style={{ '--lobby-accent': lobbySettings.accent_color } as React.CSSProperties}>{sections[section]}</div>)}</section>
        </div>
      </div>}
      {chatPopupOpen && <dialog className="chat-float-popup" open aria-labelledby="chat-float-heading" onCancel={(event) => { event.preventDefault(); setChatPopupOpen(false); }}>
        <header className="chat-float-heading"><h2 id="chat-float-heading" ref={chatHeading} tabIndex={-1}>Conversas</h2><button type="button" aria-label="Fechar conversa" onClick={() => setChatPopupOpen(false)}>×</button></header>
        <Chats characterId={character.id} preferredChatId={preferredChatId} />
      </dialog>}
      <button className="chat-float-button" type="button" aria-label={chatPopupOpen ? 'Fechar conversa' : 'Abrir conversa'} aria-expanded={chatPopupOpen} onClick={() => setChatPopupOpen((open) => !open)}>
        <span aria-hidden="true">{chatPopupOpen ? '×' : '✉'}</span><span className="chat-float-button-label">{chatPopupOpen ? 'Fechar conversa' : 'Conversar'}</span>
      </button>
    </main>
  );
}
