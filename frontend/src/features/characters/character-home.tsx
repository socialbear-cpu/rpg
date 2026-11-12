'use client';

import { useState } from 'react';
import type { CharacterSheetField, SystemCharacter } from '../../api';
import { CharacterForm } from './character-form';
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

  if (!character) return <main className="character-entry-page"><section className="character-unavailable"><span className="character-entry-eyebrow">{systemName}</span><h1>Personagem indisponível</h1><p>Este personagem não está disponível neste sistema.</p><button type="button" className="character-primary-button" onClick={onSwitch}>Voltar aos personagens</button></section></main>;

  const currentCharacter = localCharacter ?? character;
  const cardFields = [...fields].filter((field) => field.show_on_card).sort((a, b) => a.position - b.position);
  const orderedFields = [...fields].sort((a, b) => a.position - b.position);

  return (
    <main className="character-entry-page character-home-page">
      <a className="character-back-link" href="/dashboard">← Meus sistemas</a>
      <header className="lobby-heading"><div><span className="character-entry-eyebrow">{systemName} · SAGUÃO</span><h1>Bem-vindo à aventura</h1><p>Seu próximo encontro começa aqui.</p></div><button className="character-primary-button" type="button" disabled title="O matchmaking estará disponível em breve">⌕ Procurar partida <span className="lobby-soon">Em breve</span></button></header>

      <section className="lobby-character" aria-label="Personagem selecionado">
        <div className="character-card-avatar" aria-hidden="true">{currentCharacter.character_name.slice(0, 1).toUpperCase()}</div>
        <div className="lobby-character-info"><span className="character-card-system">PERSONAGEM ATIVO</span><h2>{currentCharacter.character_name}</h2>{cardFields.length > 0 && <dl className="lobby-quick-stats">{cardFields.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{String(currentCharacter.attributes[field.key] ?? '—')}</dd></div>)}</dl>}</div>
        <div className="lobby-character-actions"><button className="character-secondary-button" type="button" onClick={() => { setShowSheet((value) => !value); setEditing(false); }}>{showSheet ? 'Fechar ficha' : 'Ver ficha'}</button><button className="character-secondary-button" type="button" onClick={() => { setEditing((value) => !value); setShowSheet(false); }}>Editar personagem</button><button className="lobby-text-button" type="button" onClick={onSwitch}>Trocar personagem</button></div>
      </section>

      {showSheet && <section className="lobby-detail-panel"><h2>Ficha de {currentCharacter.character_name}</h2><dl className="lobby-sheet-fields"><div><dt>Nome</dt><dd>{currentCharacter.character_name}</dd></div>{orderedFields.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{String(currentCharacter.attributes[field.key] ?? '—')}</dd></div>)}</dl></section>}
      {editing && <section className="lobby-detail-panel"><h2>Editar personagem</h2><p className="lobby-note">Protótipo: as alterações aparecem nesta tela, mas ainda não são salvas no servidor.</p><CharacterForm fields={fields} initialName={currentCharacter.character_name} initialAttributes={currentCharacter.attributes} submitLabel="Salvar alterações" onSubmit={(name, attributes) => { setLocalCharacter({ ...currentCharacter, character_name: name, attributes }); setEditing(false); }} onCancel={() => setEditing(false)} /></section>}

      <section className="lobby-rooms"><div className="lobby-section-heading"><div><span className="character-entry-eyebrow">ENCONTRE SUA MESA</span><h2>Salas de bate-papo</h2></div><span className="lobby-count">{rooms.length} salas</span></div>
        <div className="lobby-room-grid">{rooms.map((room) => <article className="lobby-room-card" key={room.name}><div className="lobby-room-icon" aria-hidden="true">✦</div><div className="lobby-room-content"><h3>{room.name}</h3><p>{room.topic}</p><span className="lobby-room-people">● {room.people} aventureiros</span></div><button className="character-secondary-button" type="button" onClick={() => setActiveRoom(activeRoom === room.name ? null : room.name)}>{activeRoom === room.name ? 'Sair da sala' : 'Entrar na sala'} <span aria-hidden="true">→</span></button></article>)}</div>
        {activeRoom && <p role="status" className="lobby-room-status">Você entrou em <strong>{activeRoom}</strong>. A conversa da sala será conectada ao chat quando o serviço estiver disponível.</p>}
      </section>
    </main>
  );
}
