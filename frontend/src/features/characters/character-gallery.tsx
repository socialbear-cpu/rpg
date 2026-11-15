'use client';

import { getGameSystemCoverUrl, type CharacterSheetField, type GameSystem, type SystemCharacter } from '../../api';
import { formatCharacterSheetValue } from '../character-sheet/format-value';
import { AppHeader } from '../shell/app-header';
import { SystemEventsCard } from '../system-events/system-events-card';
import './characters.css';

interface CharacterGalleryProps {
  systemName: string;
  system?: GameSystem;
  fields: CharacterSheetField[];
  characters: SystemCharacter[];
  selectedCharacterId?: string | null;
  experienceByCharacterId?: Record<string, number>;
  onCreate: () => void;
  onEnter: (characterId: string) => void;
  onConfigureLobby?: () => void;
}

const characterRunes = ['ᚨ', 'ᛉ', 'ᚱ', 'ᚠ', 'ᛟ', 'ᛞ', 'ᛃ', 'ᛇ'] as const;

function characterRune(characterId: string) {
  const runeIndex = [...characterId].reduce((sum, character) => sum + character.charCodeAt(0), 0) % characterRunes.length;
  return characterRunes[runeIndex];
}

export function CharacterGallery({ systemName, system, fields, characters, selectedCharacterId = null, experienceByCharacterId = {}, onCreate, onEnter, onConfigureLobby }: CharacterGalleryProps) {
  const cardFields = [...fields].filter((field) => field.show_on_card).sort((a, b) => a.position - b.position);
  return (
    <main className="character-entry-page">
      <AppHeader activeItem="Meus Sistemas" backHref="/dashboard" backLabel="Meus sistemas" />
      <header className="character-entry-heading character-gallery-heading">
        <div><span className="character-entry-eyebrow">{systemName}</span><h1>Quem vai entrar na aventura?</h1><p>Escolha um dos seus personagens ou crie um novo.</p></div>
        {onConfigureLobby && <button className="character-secondary-button character-lobby-settings-button" type="button" onClick={onConfigureLobby}>Configurar saguão</button>}
      </header>
      {system && <section className="character-system-presentation" aria-label={`Sobre ${system.name}`}>
        {system.cover_image_path
          ? <img className="character-system-cover" src={getGameSystemCoverUrl(system.cover_image_path) ?? undefined} alt={`Capa de ${system.name}`} style={{ objectPosition: `${system.cover_focus_x ?? 50}% ${system.cover_focus_y ?? 50}%` }} />
          : <div className="character-system-cover character-system-cover-default" aria-hidden="true">✧</div>}
        <div className="character-system-details">
          <span className="character-system-mode">{system.play_mode === 'voice' ? '◉ RPG por voz' : '▤ RPG de texto'}</span>
          {system.description && <p>{system.description}</p>}
          {(system.tags?.length ?? 0) > 0 && <div className="character-system-tags">{system.tags?.map(({ slug, label }) => <span key={slug}>{label}</span>)}</div>}
        </div>
      </section>}
      {system && <SystemEventsCard systemId={system.id} />}
      {characters.length === 0 ? (
        <section className="character-empty-state"><span aria-hidden="true" className="character-empty-die">✦</span><h2>Este mundo ainda está sem personagens</h2><p>Crie seu primeiro personagem usando a ficha de {systemName}.</p><button className="character-primary-button" type="button" onClick={onCreate}>Criar personagem</button></section>
      ) : (
        <div className="character-grid">
          {characters.map((character) => {
            const cardField = cardFields.find((field) => {
              const value = formatCharacterSheetValue(field, character.attributes[field.key]);
              return value !== '—' && value.trim() !== '';
            });
            return (
              <article className={`character-card ${selectedCharacterId === character.id ? 'character-card-selected' : ''}`} key={character.id}>
                <span className="character-card-rune" aria-hidden="true">{characterRune(character.id)}</span>
                {cardField && <p className="character-card-detail"><span className="character-card-detail-label">{cardField.label}</span><span className="character-card-detail-value">{formatCharacterSheetValue(cardField, character.attributes[cardField.key])}</span></p>}
                <h2>{character.character_name}</h2>
                {experienceByCharacterId[character.id] !== undefined && <span className="character-card-level">Nível {experienceByCharacterId[character.id]}</span>}
                <button className="character-portal-button" type="button" aria-label={`Entrar com ${character.character_name}`} onClick={() => onEnter(character.id)}>
                  <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12" /><ellipse cx="16" cy="16" rx="7" ry="10" /><path d="M16 1.5v3M16 27.5v3M1.5 16h3M27.5 16h3M2.8 5.8l2.1 2.1M27.2 5.8l-2.1 2.1M2.8 26.2l2.1-2.1M27.2 26.2l-2.1-2.1M5 16h11m0 0-3-3m3 3-3 3" /></svg>
                </button>
              </article>
            );
          })}
        </div>
      )}
      <button className="character-secondary-button" type="button" onClick={onCreate}>+ Criar personagem</button>
    </main>
  );
}
