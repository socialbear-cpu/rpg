'use client';

import { useState } from 'react';
import type { CharacterSheetField, SystemCharacter } from '../../api';
import { CharacterForm } from './character-form';
import { AppHeader } from '../shell/app-header';
import './characters.css';

interface CharacterHomeProps {
  systemName: string;
  character: SystemCharacter | null;
  fields: CharacterSheetField[];
  onSwitch: () => void;
}

const rooms = [
  { name: 'Taverna do Dragão', topic: 'Conversa livre e ideias para aventuras', people: 12 },
  { name: 'Mesa de iniciantes', topic: 'Aprenda e encontre companhia para jogar', people: 4 },
  { name: 'Procura-se grupo', topic: 'Combine horários e monte sua party', people: 7 },
];

export function CharacterHome({ systemName, character, fields, onSwitch }: CharacterHomeProps) {
  const [showSheet, setShowSheet] = useState(false);
  const [editing, setEditing] = useState(false);
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [localCharacter, setLocalCharacter] = useState(character);

  if (!character) return <main className="character-entry-page"><AppHeader section="Saguão" backHref="/dashboard" backLabel="Meus sistemas" /><section className="character-unavailable"><span className="character-entry-eyebrow">{systemName}</span><h1>Personagem indisponível</h1><p>Este personagem não está disponível neste sistema.</p><button type="button" className="character-primary-button" onClick={onSwitch}>Voltar aos personagens</button></section></main>;

  const currentCharacter = localCharacter ?? character;
  const orderedFields = [...fields].sort((a, b) => a.position - b.position);

  return (
    <main className="character-entry-page character-home-page">
      <AppHeader>
        <div className="lobby-header-content"><div><span>{systemName} · SAGUÃO</span><h1>Bem-vindo à aventura</h1></div><button className="lobby-header-search" type="button" disabled title="O matchmaking estará disponível em breve">↗ Procurar</button></div>
      </AppHeader>

      <div className="lobby-layout">
        <aside className="lobby-character" aria-label="Ficha do personagem selecionado">
          <h2 className="lobby-card-title">FICHA</h2>
          <div className="lobby-portrait" aria-hidden="true"><span>{currentCharacter.character_name.slice(0, 1).toUpperCase()}</span></div>
          <h3 className="lobby-character-name">{currentCharacter.character_name}</h3>
          <div className="lobby-character-actions"><button className="character-secondary-button" type="button" onClick={() => { setShowSheet((value) => !value); setEditing(false); }}>{showSheet ? 'Fechar ficha completa' : 'Ver ficha completa'}</button><button className="character-secondary-button" type="button" onClick={() => { setEditing((value) => !value); setShowSheet(false); }}>{editing ? 'Fechar edição' : 'Editar personagem'}</button><button className="lobby-text-button" type="button" onClick={onSwitch}>Trocar personagem</button></div>
          {showSheet && <section className="lobby-detail-panel"><h3>Ficha completa</h3><dl className="lobby-sheet-fields"><div><dt>Nome</dt><dd>{currentCharacter.character_name}</dd></div>{orderedFields.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{String(currentCharacter.attributes[field.key] ?? '—')}</dd></div>)}</dl></section>}
          {editing && <section className="lobby-detail-panel"><h3>Editar personagem</h3><p className="lobby-note">Protótipo: as alterações aparecem nesta tela, mas ainda não são salvas no servidor.</p><CharacterForm fields={fields} initialName={currentCharacter.character_name} initialAttributes={currentCharacter.attributes} submitLabel="Salvar alterações" onSubmit={(name, attributes) => { setLocalCharacter({ ...currentCharacter, character_name: name, attributes }); setEditing(false); }} onCancel={() => setEditing(false)} /></section>}
        </aside>

        <div className="lobby-main">
          <section className="lobby-matchmaking" aria-label="Procurar partida"><button className="lobby-search-button" type="button" disabled title="O matchmaking estará disponível em breve">PROCURAR PARTIDA <small>Em breve</small></button></section>

          <section className="lobby-rooms"><div className="lobby-section-heading"><div><span className="character-entry-eyebrow">SUAS MESAS DE JOGO ATIVAS</span><h2>Salas de bate-papo</h2></div><span className="lobby-count">{rooms.length} salas</span></div>
            <div className="lobby-room-grid">{rooms.map((room) => <article className="lobby-room-card" key={room.name}><div className="lobby-room-icon" aria-hidden="true">＋</div><div className="lobby-room-content"><h3>{room.name}</h3><p>{room.topic}</p><span className="lobby-room-people">● {room.people} aventureiros</span></div><button className="character-secondary-button" type="button" onClick={() => setActiveRoom(activeRoom === room.name ? null : room.name)}>{activeRoom === room.name ? 'Sair da sala' : 'Entrar na sala'} <span aria-hidden="true">→</span></button></article>)}</div>
            {activeRoom && <p role="status" className="lobby-room-status">Você entrou em <strong>{activeRoom}</strong>. A conversa da sala será conectada ao chat quando o serviço estiver disponível.</p>}
          </section>
        </div>
      </div>
    </main>
  );
}
