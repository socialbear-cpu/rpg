'use client';

import type { CharacterSheetField, SystemCharacter } from '../../api';
import { AppHeader } from '../shell/app-header';
import './characters.css';

interface CharacterGalleryProps {
  systemName: string;
  fields: CharacterSheetField[];
  characters: SystemCharacter[];
  selectedCharacterId?: string | null;
  onCreate: () => void;
  onEnter: (characterId: string) => void;
}

export function CharacterGallery({ systemName, fields, characters, selectedCharacterId = null, onCreate, onEnter }: CharacterGalleryProps) {
  const cardFields = [...fields].filter((field) => field.show_on_card).sort((a, b) => a.position - b.position);
  return (
    <main className="character-entry-page">
      <AppHeader section="Personagens" backHref="/dashboard" backLabel="Meus sistemas" />
      <header className="character-entry-heading"><span className="character-entry-eyebrow">{systemName}</span><h1>Quem vai entrar na aventura?</h1><p>Escolha um dos seus personagens ou crie um novo.</p></header>
      {characters.length === 0 ? (
        <section className="character-empty-state"><span aria-hidden="true" className="character-empty-die">✦</span><h2>Este mundo ainda está sem personagens</h2><p>Crie seu primeiro personagem usando a ficha de {systemName}.</p><button className="character-primary-button" type="button" onClick={onCreate}>Criar personagem</button></section>
      ) : (
        <div className="character-grid">
          {characters.map((character) => (
            <article className={`character-card ${selectedCharacterId === character.id ? 'character-card-selected' : ''}`} key={character.id}>
              <div className="character-card-avatar" aria-hidden="true">{character.character_name.slice(0, 1).toUpperCase()}</div>
              <div className="character-card-content"><span className="character-card-system">{selectedCharacterId === character.id ? 'PERSONAGEM CRIADO' : 'PERSONAGEM'}</span><h2>{character.character_name}</h2>
                {cardFields.length > 0 && <dl>{cardFields.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{String(character.attributes[field.key] ?? '—')}</dd></div>)}</dl>}
              </div>
              <button className="character-primary-button" type="button" aria-label={`Entrar com ${character.character_name}`} onClick={() => onEnter(character.id)}>Entrar na aventura <span aria-hidden="true">→</span></button>
            </article>
          ))}
        </div>
      )}
      <button className="character-secondary-button" type="button" onClick={onCreate}>+ Criar personagem</button>
    </main>
  );
}
