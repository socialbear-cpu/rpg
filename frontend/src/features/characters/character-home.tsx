'use client';

import { useState } from 'react';
import { getGameSystemCoverUrl, type CharacterExperienceSummary, type CharacterInventory, type CharacterSheetDefinition, type CharacterSheetField, type GameSystem, type SystemCharacter } from '../../api';
import { SystemStore } from '../store/store-card';
import { AppHeader } from '../shell/app-header';
import { DailyLoginPopup } from '../daily-login/daily-login-popup';
import { CharacterRecord } from './character-record';
import { CampaignChat } from '../campaign-chat/campaign-chat';
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
}

export function CharacterHome({ system, character, sheetDefinition, inventory, recordLoading, sheetError, inventoryError, onRefreshRecord, fields = [], experience = null, onSwitch, dailyRewardVersion = 0, onDailyClaimed }: CharacterHomeProps) {
  const [showCharacterRecord, setShowCharacterRecord] = useState(false);
  const [activeRecordTab, setActiveRecordTab] = useState<'sheet' | 'inventory'>('sheet');

  if (!character) return <main className="character-entry-page"><AppHeader activeItem="Meus Sistemas" backHref="/dashboard" backLabel="Meus sistemas" /><section className="character-unavailable"><span className="character-entry-eyebrow">{system.name}</span><h1>Personagem indisponível</h1><p>Este personagem não está disponível neste sistema.</p><button type="button" className="character-primary-button" onClick={onSwitch}>Voltar aos personagens</button></section></main>;

  const visibleFields = fields.filter((field) => field.show_on_card && Object.hasOwn(character.attributes, field.key));

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
        <div className="lobby-main">
          <header className="lobby-welcome"><span className="character-entry-eyebrow">{system.name} · SAGUÃO</span><h1>Bem-vindo à aventura</h1><p>Escolha onde sua próxima história começa.</p></header>
          <section className="character-system-presentation" aria-label={`Apresentação de ${system.name}`}>
            {system.cover_image_path
              ? <img className="character-system-cover" src={getGameSystemCoverUrl(system.cover_image_path) ?? undefined} alt={`Capa de ${system.name}`} style={{ objectPosition: `${system.cover_focus_x ?? 50}% ${system.cover_focus_y ?? 50}%` }} />
              : <div className="character-system-cover character-system-cover-default" role="img" aria-label={`Capa padrão de ${system.name}`}>✧</div>}
            <div className="character-system-details">
              <p>{system.description?.trim() || 'Este sistema ainda não tem uma descrição.'}</p>
            </div>
          </section>
          <DailyLoginPopup systemId={character.game_system_id} onClaimed={onDailyClaimed} />
          <section className="lobby-matchmaking" aria-label="Procurar partida">
            <div className="lobby-search-decoration lobby-search-decoration-top" aria-hidden="true">✧</div>
            <div className="lobby-search-decoration lobby-search-decoration-left" aria-hidden="true">✧</div>
            <div className="lobby-search-decoration lobby-search-decoration-right" aria-hidden="true">✧</div>
            <button className="lobby-search-button" type="button" disabled title="O matchmaking estará disponível em breve"><span className="lobby-search-icon" aria-hidden="true">✧</span>Procurar partida<small>Em breve</small></button>
            <span className="lobby-matchmaking-caption">Encontre uma sistema para a sua próxima aventura</span>
          </section>

          <SystemStore key={`${character.id}-${dailyRewardVersion}`} systemId={character.game_system_id} characterId={character.id} characterName={character.character_name} />

          <section className="lobby-rooms">
            <CampaignChat characterId={character.id} />
            <div className="lobby-room-grid">
              <article className="lobby-room-card lobby-character-record-card">
                <div className="lobby-room-icon" aria-hidden="true">♙</div>
                <div className="lobby-room-content"><h3>Minha Ficha</h3><p>Consulte as informações do seu personagem e gerencie seu inventário.</p><span className="lobby-room-people">Acesso privado do personagem</span></div>
                <button className="character-secondary-button" type="button" onClick={() => { setShowCharacterRecord(true); onRefreshRecord(); }}>Abrir minha ficha <span aria-hidden="true">→</span></button>
              </article>
            </div>
          </section>
        </div>
      </div>}
    </main>
  );
}
