'use client';

import { useState } from 'react';
import type { CharacterExperienceSummary, CharacterInventory, CharacterSheetDefinition, CharacterSheetField, SystemCharacter } from '../../api';
import { SystemStore } from '../store/store-card';
import { AppHeader } from '../shell/app-header';
import { DailyLoginPopup } from '../daily-login/daily-login-popup';
import { CharacterRecord } from './character-record';
import './characters.css';

interface CharacterHomeProps {
  systemName: string;
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

const rooms = [
  { name: 'Taverna do Dragão', topic: 'Conversa livre e ideias para aventuras' },
  { name: 'sistema de iniciantes', topic: 'Aprenda e encontre companhia para jogar' },
  { name: 'Procura-se grupo', topic: 'Combine horários e monte sua party' },
];

export function CharacterHome({ systemName, character, sheetDefinition, inventory, recordLoading, sheetError, inventoryError, onRefreshRecord, fields = [], experience = null, onSwitch, dailyRewardVersion = 0, onDailyClaimed }: CharacterHomeProps) {
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [showCharacterRecord, setShowCharacterRecord] = useState(false);
  const [activeRecordTab, setActiveRecordTab] = useState<'sheet' | 'inventory'>('sheet');

  if (!character) return <main className="character-entry-page"><AppHeader activeItem="Meus Sistemas" backHref="/dashboard" backLabel="Meus sistemas" /><section className="character-unavailable"><span className="character-entry-eyebrow">{systemName}</span><h1>Personagem indisponível</h1><p>Este personagem não está disponível neste sistema.</p><button type="button" className="character-primary-button" onClick={onSwitch}>Voltar aos personagens</button></section></main>;

  const visibleFields = fields.filter((field) => field.show_on_card && Object.hasOwn(character.attributes, field.key));

  return (
    <main className="character-entry-page character-home-page">
      <AppHeader activeItem="Meus Sistemas" characterSheet={{ systemName, character, fields: visibleFields, experience }} />

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
          <header className="lobby-welcome"><span className="character-entry-eyebrow">{systemName} · SAGUÃO</span><h1>Bem-vindo à aventura</h1><p>Escolha onde sua próxima história começa.</p></header>
          <DailyLoginPopup systemId={character.game_system_id} onClaimed={onDailyClaimed} />
          <section className="lobby-matchmaking" aria-label="Procurar partida">
            <div className="lobby-search-decoration lobby-search-decoration-top" aria-hidden="true">✧</div>
            <div className="lobby-search-decoration lobby-search-decoration-left" aria-hidden="true">✧</div>
            <div className="lobby-search-decoration lobby-search-decoration-right" aria-hidden="true">✧</div>
            <button className="lobby-search-button" type="button" disabled title="O matchmaking estará disponível em breve"><span className="lobby-search-icon" aria-hidden="true">✧</span>Procurar partida<small>Em breve</small></button>
            <span className="lobby-matchmaking-caption">Encontre uma sistema para a sua próxima aventura</span>
          </section>

          <SystemStore key={`${character.id}-${dailyRewardVersion}`} systemId={character.game_system_id} characterId={character.id} characterName={character.character_name} />

          <section className="lobby-rooms"><div className="lobby-section-heading"><div><span className="character-entry-eyebrow">PONTO DE ENCONTRO</span><h2>Salas de bate-papo</h2></div></div>
            <div className="lobby-room-grid">
              {rooms.map((room) => <article className="lobby-room-card" key={room.name}><div className="lobby-room-icon" aria-hidden="true">＋</div><div className="lobby-room-content"><h3>{room.name}</h3><p>{room.topic}</p><span className="lobby-room-people">Sala da comunidade</span></div><button className="character-secondary-button" type="button" onClick={() => setActiveRoom(activeRoom === room.name ? null : room.name)}>{activeRoom === room.name ? 'Sair da sala' : 'Entrar na sala'} <span aria-hidden="true">→</span></button></article>)}
              <article className="lobby-room-card lobby-character-record-card">
                <div className="lobby-room-icon" aria-hidden="true">♙</div>
                <div className="lobby-room-content"><h3>Minha Ficha</h3><p>Consulte as informações do seu personagem e gerencie seu inventário.</p><span className="lobby-room-people">Acesso privado do personagem</span></div>
                <button className="character-secondary-button" type="button" onClick={() => { setShowCharacterRecord(true); onRefreshRecord(); }}>Abrir minha ficha <span aria-hidden="true">→</span></button>
              </article>
            </div>
            {activeRoom && <p role="status" className="lobby-room-status">Você selecionou <strong>{activeRoom}</strong>. O chat será conectado quando o serviço de salas estiver disponível.</p>}
          </section>
        </div>
      </div>}
    </main>
  );
}
