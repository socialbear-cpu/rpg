'use client';

import { useState } from 'react';
import { defaultSystemLobbySettings, getGameSystemCoverUrl, type CharacterExperienceSummary, type CharacterInventory, type CharacterSheetDefinition, type CharacterSheetField, type GameSystem, type LobbySectionId, type SystemCharacter, type SystemLobbySettings } from '../../api';
import { SystemStore } from '../store/store-card';
import { AppHeader } from '../shell/app-header';
import { DailyLoginPopup } from '../daily-login/daily-login-popup';
import { CharacterRecord } from './character-record';
import { Chats } from '../chats/chats';
import { SystemEventsCard } from '../system-events/system-events-card';
import { LobbyCreatorTools } from './lobby-creator-tools';
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
  const [chatReload, setChatReload] = useState(0);
  const [preferredChatId, setPreferredChatId] = useState<string | null>(initialPreferredChatId);

  if (!character) return <main className="character-entry-page"><AppHeader activeItem="Meus Sistemas" backHref="/dashboard" backLabel="Meus sistemas" /><section className="character-unavailable"><span className="character-entry-eyebrow">{system.name}</span><h1>Personagem indisponível</h1><p>Este personagem não está disponível neste sistema.</p><button type="button" className="character-primary-button" onClick={onSwitch}>Voltar aos personagens</button></section></main>;

  const visibleFields = fields.filter((field) => field.show_on_card && Object.hasOwn(character.attributes, field.key));
  const sections: Record<LobbySectionId, React.ReactNode> = {
    'system-presentation': <section className="character-system-presentation lobby-character-home-section" aria-label={`Apresentação de ${system.name}`}>
      {system.cover_image_path
        ? <img className="character-system-cover" src={getGameSystemCoverUrl(system.cover_image_path) ?? undefined} alt={`Capa de ${system.name}`} style={{ objectPosition: `${system.cover_focus_x ?? 50}% ${system.cover_focus_y ?? 50}%` }} />
        : <div className="character-system-cover character-system-cover-default" role="img" aria-label={`Capa padrão de ${system.name}`}>✧</div>}
      <div className="character-system-details"><p>{system.description?.trim() || 'Este sistema ainda não tem uma descrição.'}</p></div>
    </section>,
    matchmaking: <section className="lobby-matchmaking lobby-character-home-section" aria-label="Procurar partida">
      <div className="lobby-search-decoration lobby-search-decoration-top" aria-hidden="true">✧</div><div className="lobby-search-decoration lobby-search-decoration-left" aria-hidden="true">✧</div><div className="lobby-search-decoration lobby-search-decoration-right" aria-hidden="true">✧</div>
      <button className="lobby-search-button" type="button" disabled title="O matchmaking estará disponível em breve"><span className="lobby-search-icon" aria-hidden="true">✧</span>Procurar partida<small>Em breve</small></button>
      <span className="lobby-matchmaking-caption">Encontre uma sistema para a sua próxima aventura</span>
    </section>,
    store: <section className="lobby-character-home-section" aria-label="Loja do sistema"><SystemStore key={`${character.id}-${dailyRewardVersion}`} systemId={character.game_system_id} characterId={character.id} characterName={character.character_name} /></section>,
    chat: <div className="lobby-character-home-section" id="chat"><Chats characterId={character.id} reloadToken={chatReload} preferredChatId={preferredChatId} /></div>,
    events: <div className="lobby-character-home-section" id="system-events"><SystemEventsCard systemId={character.game_system_id} canManage={isCreator} /></div>,
    'character-sheet': <button className="lobby-character-record-action lobby-character-home-section" type="button" onClick={() => { setShowCharacterRecord(true); onRefreshRecord(); }}>
      <span className="lobby-character-record-icon" aria-hidden="true">♙</span><span className="lobby-character-record-copy"><strong>Minha Ficha</strong><small>Consultar dados e inventário</small></span><span className="lobby-character-record-arrow" aria-hidden="true">→</span>
    </button>,
  };

  return (
    <main className="character-entry-page character-home-page">
      <AppHeader activeItem="Meus Sistemas" characterSheet={{ systemName: system.name, character, fields: visibleFields, experience }} />

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
          <header className="lobby-welcome"><span className="character-entry-eyebrow">{system.name} · SAGUÃO</span><h1>{lobbySettings.welcome_title}</h1><p>{lobbySettings.welcome_message}</p></header>
          {isCreator && <LobbyCreatorTools system={system} characterId={character.id} settings={lobbySettings}
            onChatCreated={(chatId) => { setPreferredChatId(chatId); setChatReload((version) => version + 1); }}
          />}
          <DailyLoginPopup systemId={character.game_system_id} onClaimed={onDailyClaimed} />
          <section className="lobby-rooms">{lobbySettings.section_order.map((section) => lobbySettings.hidden_sections.includes(section) ? null : <div key={section} style={{ '--lobby-accent': lobbySettings.accent_color } as React.CSSProperties}>{sections[section]}</div>)}</section>
        </div>
      </div>}
    </main>
  );
}
