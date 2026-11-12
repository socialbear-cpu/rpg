'use client';

import { useState } from 'react';
import type { CharacterExperienceSummary, CharacterSheetField, SystemCharacter } from '../../api';
import { CharacterForm } from './character-form';
import { AppHeader } from '../shell/app-header';
import './characters.css';

interface CharacterHomeProps {
  systemName: string;
  character: SystemCharacter | null;
  fields: CharacterSheetField[];
  experience?: CharacterExperienceSummary | null;
  onSwitch: () => void;
}

const rooms = [
  { name: 'Taverna do Dragão', topic: 'Conversa livre e ideias para aventuras' },
  { name: 'Mesa de iniciantes', topic: 'Aprenda e encontre companhia para jogar' },
  { name: 'Procura-se grupo', topic: 'Combine horários e monte sua party' },
];

export function CharacterHome({ systemName, character, fields, experience = null, onSwitch }: CharacterHomeProps) {
  const [editing, setEditing] = useState(false);
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [localCharacter, setLocalCharacter] = useState(character);

  if (!character) return <main className="character-entry-page"><AppHeader activeItem="Minhas mesas" backHref="/dashboard" backLabel="Meus sistemas" /><section className="character-unavailable"><span className="character-entry-eyebrow">{systemName}</span><h1>Personagem indisponível</h1><p>Este personagem não está disponível neste sistema.</p><button type="button" className="character-primary-button" onClick={onSwitch}>Voltar aos personagens</button></section></main>;

  const currentCharacter = localCharacter ?? character;
  const orderedFields = [...fields].sort((a, b) => a.position - b.position);
  const requiredXp = experience ? experience.xp_in_level + experience.xp_to_next_level : null;
  const progress = requiredXp && experience ? Math.min(100, (experience.xp_in_level / requiredXp) * 100) : 0;

  return (
    <main className="character-entry-page character-home-page">
      <AppHeader activeItem="Minhas mesas" />

      <div className="lobby-layout">
        <aside className="lobby-character" aria-label="Ficha do personagem selecionado">
          <div className="lobby-character-heading">
            <span className="character-entry-eyebrow">SUA FICHA</span>
            <h2 className="lobby-character-name">{currentCharacter.character_name}</h2>
            <span className="lobby-level">Nível {experience?.level ?? '—'}</span>
          </div>
          <section className="lobby-xp" aria-label="Experiência do personagem">
            <div className="lobby-xp-label"><span>Experiência</span><strong>{experience ? `${experience.total_xp} XP` : 'Indisponível'}</strong></div>
            <div className="lobby-xp-track" role="progressbar" aria-label="Progresso para o próximo nível" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></div>
            <div className="lobby-xp-caption"><span>{experience ? `${experience.xp_in_level} / ${requiredXp} XP` : 'Progresso não disponível'}</span><span>{experience ? `Faltam ${experience.xp_to_next_level} XP` : ''}</span></div>
          </section>
          <dl className="lobby-sheet-fields">
            {orderedFields.length ? orderedFields.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{String(currentCharacter.attributes[field.key] ?? '—')}</dd></div>) : <div><dt>Sistema</dt><dd>{systemName}</dd></div>}
          </dl>
          <div className="lobby-character-actions">
            <button className="character-secondary-button" type="button" onClick={() => setEditing((value) => !value)}>{editing ? 'Fechar edição' : 'Editar personagem'}</button>
            <button className="lobby-text-button" type="button" onClick={onSwitch}>Trocar personagem</button>
          </div>
          {editing && <section className="lobby-detail-panel"><h3>Editar personagem</h3><p className="lobby-note">Protótipo: as alterações aparecem nesta tela, mas ainda não são salvas no servidor.</p><CharacterForm fields={fields} initialName={currentCharacter.character_name} initialAttributes={currentCharacter.attributes} submitLabel="Salvar alterações" onSubmit={(name, attributes) => { setLocalCharacter({ ...currentCharacter, character_name: name, attributes }); setEditing(false); }} onCancel={() => setEditing(false)} /></section>}
        </aside>

        <div className="lobby-main">
          <header className="lobby-welcome"><span className="character-entry-eyebrow">{systemName} · SAGUÃO</span><h1>Bem-vindo à aventura</h1><p>Escolha onde sua próxima história começa.</p></header>
          <section className="lobby-matchmaking" aria-label="Procurar partida">
            <div className="lobby-search-decoration lobby-search-decoration-top" aria-hidden="true">✧</div>
            <div className="lobby-search-decoration lobby-search-decoration-left" aria-hidden="true">✧</div>
            <div className="lobby-search-decoration lobby-search-decoration-right" aria-hidden="true">✧</div>
            <button className="lobby-search-button" type="button" disabled title="O matchmaking estará disponível em breve"><span className="lobby-search-icon" aria-hidden="true">✧</span>Procurar partida<small>Em breve</small></button>
            <span className="lobby-matchmaking-caption">Encontre uma mesa para a sua próxima aventura</span>
          </section>

          <section className="lobby-rooms"><div className="lobby-section-heading"><div><span className="character-entry-eyebrow">PONTO DE ENCONTRO</span><h2>Salas de bate-papo</h2></div></div>
            <div className="lobby-room-grid">{rooms.map((room) => <article className="lobby-room-card" key={room.name}><div className="lobby-room-icon" aria-hidden="true">＋</div><div className="lobby-room-content"><h3>{room.name}</h3><p>{room.topic}</p><span className="lobby-room-people">Sala da comunidade</span></div><button className="character-secondary-button" type="button" onClick={() => setActiveRoom(activeRoom === room.name ? null : room.name)}>{activeRoom === room.name ? 'Sair da sala' : 'Entrar na sala'} <span aria-hidden="true">→</span></button></article>)}</div>
            {activeRoom && <p role="status" className="lobby-room-status">Você selecionou <strong>{activeRoom}</strong>. O chat será conectado quando o serviço de salas estiver disponível.</p>}
          </section>
        </div>
      </div>
    </main>
  );
}
